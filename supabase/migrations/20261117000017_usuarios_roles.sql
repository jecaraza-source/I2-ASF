-- Usuarios y roles: baja lógica de miembros, bitácora de acceso y control de cambios.
--
--  * Un miembro se desactiva, no se borra: pierde el acceso y su historial se conserva.
--  * `es_miembro` exige miembro activo, así que la baja corta todas las políticas a la vez.
--  * Toda alta, cambio de rol, baja y reactivación queda en `bitacora` desde la base.
--  * Siempre queda un administrador activo, y nadie cambia su propio acceso.
--  * Los accesos (inicio, cierre, intento fallido) se registran en `bitacora` con IP y navegador.

alter table public.miembro
  add column activo boolean not null default true,
  add column desactivado_en timestamptz,
  add column desactivado_por uuid references auth.users (id) on delete set null;
create index miembro_desactivado_por_idx on public.miembro (desactivado_por);

comment on column public.miembro.activo is
  'false = dado de baja: no pasa ninguna política. No se borra para conservar el historial.';

-- ---------------------------------------------------------------------------
-- es_miembro: solo cuentan los miembros activos.
-- ---------------------------------------------------------------------------
create or replace function public.es_miembro(p_organizacion_id uuid, p_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.miembro m
    where m.organizacion_id = p_organizacion_id
      and m.usuario_id = (select auth.uid())
      and m.activo
      and (p_roles is null or m.rol = any (p_roles))
  );
$$;

-- La baja es lógica: los usuarios ya no borran miembros.
drop policy miembro_delete on public.miembro;
revoke delete on public.miembro from authenticated;

-- ---------------------------------------------------------------------------
-- Candados y control de cambios de `miembro`.
-- ---------------------------------------------------------------------------
create function privado.miembro_candados()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if new.organizacion_id is distinct from old.organizacion_id
     or new.usuario_id is distinct from old.usuario_id then
    raise exception 'miembro_fijo: no se cambia la organización ni el usuario de un miembro'
      using errcode = '23514';
  end if;

  if new.rol is distinct from old.rol or new.activo is distinct from old.activo then
    if v_actor is not null and v_actor = old.usuario_id then
      raise exception 'propio_acceso: nadie cambia su propio rol ni se da de baja'
        using errcode = '23514';
    end if;
    -- Siempre queda al menos un administrador activo en la organización.
    if old.rol = 'admin' and old.activo and (new.rol <> 'admin' or not new.activo) then
      perform 1 from public.miembro m
       where m.organizacion_id = old.organizacion_id and m.id <> old.id
         and m.rol = 'admin' and m.activo
       for update;
      if not found then
        raise exception 'ultimo_admin: la organización se quedaría sin administrador'
          using errcode = '23514';
      end if;
    end if;
  end if;

  if old.activo and not new.activo then
    new.desactivado_en := now();
    new.desactivado_por := v_actor;
  elsif new.activo and not old.activo then
    new.desactivado_en := null;
    new.desactivado_por := null;
  else
    new.desactivado_en := old.desactivado_en;
    new.desactivado_por := old.desactivado_por;
  end if;
  return new;
end;
$$;
create trigger miembro_candados
  before update on public.miembro
  for each row execute function privado.miembro_candados();

create function privado.miembro_alta()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Un miembro nace activo, venga lo que venga en el insert.
  new.activo := true;
  new.desactivado_en := null;
  new.desactivado_por := null;
  return new;
end;
$$;
create trigger miembro_alta
  before insert on public.miembro
  for each row execute function privado.miembro_alta();

-- Control de cambios: guarda IDs y roles, nunca correos ni nombres.
create function privado.miembro_bitacora()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    insert into public.bitacora (organizacion_id, actor, accion, objeto_tipo, objeto_id, detalle)
    values (new.organizacion_id, v_actor, 'usuario.alta', 'miembro', new.id,
            jsonb_build_object('usuario_id', new.usuario_id, 'rol', new.rol));
    return new;
  end if;
  if new.rol is distinct from old.rol then
    insert into public.bitacora (organizacion_id, actor, accion, objeto_tipo, objeto_id, detalle)
    values (new.organizacion_id, v_actor, 'usuario.rol', 'miembro', new.id,
            jsonb_build_object('usuario_id', new.usuario_id, 'antes', old.rol, 'despues', new.rol));
  end if;
  if new.activo is distinct from old.activo then
    insert into public.bitacora (organizacion_id, actor, accion, objeto_tipo, objeto_id, detalle)
    values (new.organizacion_id, v_actor,
            case when new.activo then 'usuario.reactivacion' else 'usuario.baja' end,
            'miembro', new.id, jsonb_build_object('usuario_id', new.usuario_id, 'rol', new.rol));
  end if;
  return new;
end;
$$;
create trigger miembro_bitacora
  after insert or update on public.miembro
  for each row execute function privado.miembro_bitacora();

revoke all on function privado.miembro_candados() from public, anon, authenticated;
revoke all on function privado.miembro_alta() from public, anon, authenticated;
revoke all on function privado.miembro_bitacora() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Bitácora de acceso.
-- ---------------------------------------------------------------------------
create function privado.detalle_acceso(p_ip text, p_navegador text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'ip', nullif(left(trim(coalesce(p_ip, '')), 64), ''),
    'navegador', nullif(left(trim(coalesce(p_navegador, '')), 300), '')));
$$;

-- Inicio o cierre de sesión del usuario actual: una fila por organización en la que está activo.
create function public.registrar_acceso(p_tipo text, p_ip text default null, p_navegador text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
begin
  if v_usuario is null then
    raise exception 'sin sesión' using errcode = '42501';
  end if;
  if p_tipo not in ('inicio', 'cierre') then
    raise exception 'tipo de acceso no válido' using errcode = '22023';
  end if;
  insert into public.bitacora (organizacion_id, actor, accion, objeto_tipo, objeto_id, detalle)
  select m.organizacion_id, v_usuario, 'sesion.' || p_tipo, 'sesion', v_usuario,
         privado.detalle_acceso(p_ip, p_navegador)
    from public.miembro m
   where m.usuario_id = v_usuario and m.activo;
end;
$$;
revoke all on function public.registrar_acceso(text, text, text) from public, anon;
grant execute on function public.registrar_acceso(text, text, text) to authenticated;

-- Intento fallido: se atribuye por correo a las organizaciones del usuario, si existe. No devuelve
-- nada (no revela si el correo existe) y guarda a lo más 10 por usuario y hora, para que nadie
-- infle la bitácora desde fuera.
create function public.registrar_acceso_fallido(p_correo text, p_ip text default null, p_navegador text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid;
begin
  select u.id into v_usuario from auth.users u
   where lower(u.email) = lower(trim(coalesce(p_correo, ''))) limit 1;
  if v_usuario is null then
    return;
  end if;
  if (select count(*) from public.bitacora b
       where b.accion = 'sesion.fallo' and b.objeto_id = v_usuario
         and b.en > now() - interval '1 hour') >= 10 then
    return;
  end if;
  insert into public.bitacora (organizacion_id, actor, accion, objeto_tipo, objeto_id, detalle)
  select m.organizacion_id, null, 'sesion.fallo', 'sesion', v_usuario,
         privado.detalle_acceso(p_ip, p_navegador)
    from public.miembro m
   where m.usuario_id = v_usuario;
end;
$$;
revoke all on function public.registrar_acceso_fallido(text, text, text) from public;
grant execute on function public.registrar_acceso_fallido(text, text, text) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Lecturas para la pantalla de usuarios (solo administradores de la organización).
-- ---------------------------------------------------------------------------
create function public.usuarios_organizacion(p_organizacion_id uuid)
returns table (
  miembro_id uuid, usuario_id uuid, correo text, rol text, activo boolean,
  creado_en timestamptz, desactivado_en timestamptz, ultimo_acceso timestamptz, pendiente boolean)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_miembro(p_organizacion_id, '{admin}') then
    raise exception 'solo un administrador consulta los usuarios' using errcode = '42501';
  end if;
  return query
  select m.id, m.usuario_id, u.email::text, m.rol, m.activo, m.creado_en, m.desactivado_en,
         u.last_sign_in_at, (u.last_sign_in_at is null)
    from public.miembro m
    join auth.users u on u.id = m.usuario_id
   where m.organizacion_id = p_organizacion_id
   order by m.activo desc, lower(u.email);
end;
$$;
revoke all on function public.usuarios_organizacion(uuid) from public, anon;
grant execute on function public.usuarios_organizacion(uuid) to authenticated;

-- ID del usuario con ese correo, si ya tiene cuenta (para agregarlo sin crear otra).
create function public.usuario_por_correo(p_organizacion_id uuid, p_correo text)
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_miembro(p_organizacion_id, '{admin}') then
    raise exception 'solo un administrador busca usuarios' using errcode = '42501';
  end if;
  return (select u.id from auth.users u
           where lower(u.email) = lower(trim(coalesce(p_correo, ''))) limit 1);
end;
$$;
revoke all on function public.usuario_por_correo(uuid, text) from public, anon;
grant execute on function public.usuario_por_correo(uuid, text) to authenticated;

-- Bitácora de usuarios: p_clase = 'acceso' (sesiones) o 'cambios' (altas, roles, bajas).
create function public.bitacora_usuarios(
  p_organizacion_id uuid, p_clase text, p_usuario_id uuid default null,
  p_desde date default null, p_hasta date default null, p_limite int default 200)
returns table (
  id uuid, en timestamptz, accion text, actor_correo text, usuario_id uuid, usuario_correo text,
  detalle jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.es_miembro(p_organizacion_id, '{admin}') then
    raise exception 'solo un administrador consulta la bitácora de usuarios' using errcode = '42501';
  end if;
  if p_clase not in ('acceso', 'cambios') then
    raise exception 'clase no válida' using errcode = '22023';
  end if;
  return query
  select b.id, b.en, b.accion, a.email::text, s.usuario, u.email::text, b.detalle
    from public.bitacora b
    cross join lateral (
      select case when b.objeto_tipo = 'sesion' then b.objeto_id
                  else (b.detalle ->> 'usuario_id')::uuid end as usuario) s
    left join auth.users a on a.id = b.actor
    left join auth.users u on u.id = s.usuario
   where b.organizacion_id = p_organizacion_id
     and ((p_clase = 'acceso' and b.objeto_tipo = 'sesion')
       or (p_clase = 'cambios' and b.objeto_tipo = 'miembro'))
     and (p_usuario_id is null or s.usuario = p_usuario_id)
     and (p_desde is null or b.en >= p_desde::timestamp at time zone 'America/Mexico_City')
     and (p_hasta is null
          or b.en < (p_hasta + 1)::timestamp at time zone 'America/Mexico_City')
   order by b.en desc
   limit least(greatest(coalesce(p_limite, 200), 1), 500);
end;
$$;
revoke all on function public.bitacora_usuarios(uuid, text, uuid, date, date, int) from public, anon;
grant execute on function public.bitacora_usuarios(uuid, text, uuid, date, date, int) to authenticated;
