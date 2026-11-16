-- Tarea 01 · Migración 1: organización, miembros, función es_miembro y bitácora.
-- docs/ESPECIFICACION.md §2 (Organización y acceso, bitacora) y §3.

-- Las tablas nuevas del esquema public no se exponen a usuarios anónimos.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- Esquema privado para funciones auxiliares que no se exponen por la API.
create schema if not exists privado;
revoke all on schema privado from public, anon;
grant usage on schema privado to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- organizacion
-- ---------------------------------------------------------------------------
create table public.organizacion (
  id uuid primary key default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) > 0),
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid()
);
alter table public.organizacion enable row level security;
revoke all on public.organizacion from anon;

-- ---------------------------------------------------------------------------
-- miembro
-- ---------------------------------------------------------------------------
create table public.miembro (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizacion (id) on delete cascade,
  usuario_id uuid not null references auth.users (id) on delete cascade,
  rol text not null check (rol in ('admin', 'auditor', 'lector')),
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  unique (organizacion_id, usuario_id)
);
create index miembro_usuario_idx on public.miembro (usuario_id);
create index miembro_creado_por_idx on public.miembro (creado_por);
alter table public.miembro enable row level security;
revoke all on public.miembro from anon;

-- ---------------------------------------------------------------------------
-- es_miembro: base de todas las políticas.
-- security definer para poder leer miembro sin recursión de RLS.
-- ---------------------------------------------------------------------------
create function public.es_miembro(p_organizacion_id uuid, p_roles text[] default null)
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
      and (p_roles is null or m.rol = any (p_roles))
  );
$$;
revoke all on function public.es_miembro(uuid, text[]) from public, anon;
grant execute on function public.es_miembro(uuid, text[]) to authenticated, service_role;

create policy organizacion_select on public.organizacion
  for select to authenticated using ((select public.es_miembro(id)));
create policy organizacion_update on public.organizacion
  for update to authenticated
  using ((select public.es_miembro(id, '{admin}')))
  with check ((select public.es_miembro(id, '{admin}')));

create policy miembro_select on public.miembro
  for select to authenticated using ((select public.es_miembro(organizacion_id)));
create policy miembro_insert on public.miembro
  for insert to authenticated with check ((select public.es_miembro(organizacion_id, '{admin}')));
create policy miembro_update on public.miembro
  for update to authenticated
  using ((select public.es_miembro(organizacion_id, '{admin}')))
  with check ((select public.es_miembro(organizacion_id, '{admin}')));
create policy miembro_delete on public.miembro
  for delete to authenticated using ((select public.es_miembro(organizacion_id, '{admin}')));

-- ---------------------------------------------------------------------------
-- Políticas estándar para tablas de dominio.
--   lectura: cualquier miembro de la organización.
--   escritura (insert y, si aplica, update/delete): los roles indicados.
-- Se invoca en la misma migración que crea cada tabla.
-- ---------------------------------------------------------------------------
create function privado.aplicar_rls(
  p_tabla regclass,
  p_roles_escritura text[],
  p_update boolean default true,
  p_delete boolean default false
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  t text := p_tabla::text;
  n text := replace(split_part(p_tabla::text, '.', 2), '"', '');
  r text := quote_literal(p_roles_escritura::text);
begin
  execute format('alter table %s enable row level security', t);
  execute format('revoke all on %s from anon', t);
  execute format(
    'create policy %I on %s for select to authenticated using ((select public.es_miembro(organizacion_id)))',
    n || '_select', t);
  execute format(
    'create policy %I on %s for insert to authenticated with check ((select public.es_miembro(organizacion_id, %s)))',
    n || '_insert', t, r);
  if p_update then
    execute format(
      'create policy %I on %s for update to authenticated using ((select public.es_miembro(organizacion_id, %s))) with check ((select public.es_miembro(organizacion_id, %s)))',
      n || '_update', t, r, r);
  else
    execute format('revoke update on %s from authenticated', t);
  end if;
  if p_delete then
    execute format(
      'create policy %I on %s for delete to authenticated using ((select public.es_miembro(organizacion_id, %s)))',
      n || '_delete', t, r);
  else
    execute format('revoke delete, truncate on %s from authenticated', t);
  end if;
end;
$$;
revoke all on function privado.aplicar_rls(regclass, text[], boolean, boolean) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- bitacora: append-only.
-- Sin políticas de UPDATE/DELETE, sin privilegios para hacerlo y con un
-- disparador que lo impide incluso a service_role.
-- ---------------------------------------------------------------------------
create table public.bitacora (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizacion (id),
  encargo_id uuid,
  actor uuid references auth.users (id) on delete set null,
  accion text not null,
  objeto_tipo text not null,
  objeto_id uuid,
  detalle jsonb not null default '{}'::jsonb,
  en timestamptz not null default now(),
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid()
);
create index bitacora_organizacion_idx on public.bitacora (organizacion_id, en desc);
create index bitacora_encargo_idx on public.bitacora (encargo_id, en desc);
create index bitacora_objeto_idx on public.bitacora (objeto_tipo, objeto_id);
create index bitacora_actor_idx on public.bitacora (actor);
create index bitacora_creado_por_idx on public.bitacora (creado_por);

alter table public.bitacora enable row level security;
revoke all on public.bitacora from anon;
revoke update, delete, truncate on public.bitacora from authenticated, service_role;

create policy bitacora_select on public.bitacora
  for select to authenticated using ((select public.es_miembro(organizacion_id)));
create policy bitacora_insert on public.bitacora
  for insert to authenticated
  with check (
    (select public.es_miembro(organizacion_id))
    and actor is not distinct from (select auth.uid())
  );

create function privado.bitacora_inmutable()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'bitacora es append-only: % no permitido', tg_op
    using errcode = '42501';
end;
$$;

create trigger bitacora_sin_cambios
  before update or delete on public.bitacora
  for each row execute function privado.bitacora_inmutable();
create trigger bitacora_sin_truncate
  before truncate on public.bitacora
  for each statement execute function privado.bitacora_inmutable();

-- ---------------------------------------------------------------------------
-- Disparador genérico que escribe en bitácora.
--   TG_ARGV[0]: acción (p. ej. 'registro.alta').
--   TG_ARGV[1..]: columnas cuyo cambio se documenta en detalle (antes/después).
-- Solo guarda IDs y estados, nunca valores de evidencia (CLAUDE.md, regla 7).
-- ---------------------------------------------------------------------------
create function privado.escribir_bitacora()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  nuevo jsonb := to_jsonb(new);
  viejo jsonb := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  detalle jsonb := jsonb_build_object('operacion', lower(tg_op));
  i int;
  col text;
begin
  if tg_nargs > 1 then
    for i in 1 .. tg_nargs - 1 loop
      col := tg_argv[i];
      if viejo is null then
        detalle := detalle || jsonb_build_object(col, nuevo -> col);
      elsif (viejo -> col) is distinct from (nuevo -> col) then
        detalle := detalle || jsonb_build_object(
          col, jsonb_build_object('antes', viejo -> col, 'despues', nuevo -> col));
      end if;
    end loop;
  end if;

  insert into public.bitacora (organizacion_id, encargo_id, actor, accion, objeto_tipo, objeto_id, detalle)
  values (
    (nuevo ->> 'organizacion_id')::uuid,
    (nuevo ->> 'encargo_id')::uuid,
    (select auth.uid()),
    tg_argv[0],
    tg_table_name,
    (nuevo ->> 'id')::uuid,
    detalle
  );
  return new;
end;
$$;
revoke all on function privado.escribir_bitacora() from public, anon, authenticated;
