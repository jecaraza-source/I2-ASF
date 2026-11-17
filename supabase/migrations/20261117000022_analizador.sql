-- Tarea 15 · Analizador (síntesis con origen) y hallazgos.
--
-- Una síntesis resume un alcance (un expediente o una entidad) a partir de registros VALIDADOS que
-- elige el auditor. La IA propone afirmaciones; cada una cita los registros que la sostienen y la
-- base rechaza cualquier afirmación sin cita o que cite algo fuera del alcance o sin validar
-- (reglas 1 y 4). Nace como borrador; el auditor la edita y la aprueba. Se guardan la versión de la
-- IA y la aprobada, inmutables. La síntesis aprobada se adjunta a un hallazgo que redacta y firma un
-- auditor: nunca crea hallazgos sola.

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------
create table public.sintesis (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,
  encargo_id uuid not null,
  alcance_tipo text not null check (alcance_tipo in ('expediente', 'entidad')),
  alcance_id uuid not null,
  registros uuid[] not null check (cardinality(registros) between 1 and 300),
  estado text not null default 'generando'
    check (estado in ('generando', 'en_espera', 'error', 'borrador', 'aprobada', 'descartada')),
  motivo text check (motivo is null or length(motivo) <= 500),
  proveedor text check (proveedor is null or proveedor in ('anthropic', 'openai')),
  modelo text check (modelo is null or modelo ~ '^[A-Za-z0-9._:-]{1,80}$'),
  generada_en timestamptz,
  aprobada_por uuid references auth.users (id) on delete set null,
  aprobada_en timestamptz,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (organizacion_id, encargo_id) references public.encargo (organizacion_id, id),
  unique (encargo_id, id),
  check ((estado = 'aprobada') = (aprobada_en is not null))
);
create index sintesis_encargo_idx on public.sintesis (organizacion_id, encargo_id, creado_en desc);
create index sintesis_aprobada_por_idx on public.sintesis (aprobada_por);
create index sintesis_creado_por_idx on public.sintesis (creado_por);
select privado.aplicar_rls('public.sintesis', '{admin,auditor}', true, false);

create table public.afirmacion (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,
  encargo_id uuid not null,
  sintesis_id uuid not null,
  version text not null check (version in ('ia', 'borrador', 'aprobada')),
  orden int not null check (orden between 1 and 200),
  texto text not null check (length(trim(texto)) between 1 and 2000),
  registros uuid[] not null check (cardinality(registros) between 1 and 50),
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (organizacion_id, encargo_id) references public.encargo (organizacion_id, id),
  foreign key (encargo_id, sintesis_id) references public.sintesis (encargo_id, id),
  unique (sintesis_id, version, orden)
);
create index afirmacion_organizacion_encargo_idx on public.afirmacion (organizacion_id, encargo_id);
create index afirmacion_creado_por_idx on public.afirmacion (creado_por);
select privado.aplicar_rls('public.afirmacion', '{admin,auditor}', false, true);

create table public.hallazgo_sintesis (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,
  encargo_id uuid not null,
  hallazgo_id uuid not null,
  sintesis_id uuid not null,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (organizacion_id, encargo_id) references public.encargo (organizacion_id, id),
  foreign key (encargo_id, hallazgo_id) references public.hallazgo (encargo_id, id),
  foreign key (encargo_id, sintesis_id) references public.sintesis (encargo_id, id),
  unique (hallazgo_id, sintesis_id)
);
create index hallazgo_sintesis_organizacion_encargo_idx on public.hallazgo_sintesis (organizacion_id, encargo_id);
create index hallazgo_sintesis_sintesis_idx on public.hallazgo_sintesis (encargo_id, sintesis_id);
create index hallazgo_sintesis_creado_por_idx on public.hallazgo_sintesis (creado_por);
select privado.aplicar_rls('public.hallazgo_sintesis', '{admin,auditor}', false, false);

-- ---------------------------------------------------------------------------
-- Registros que una síntesis puede citar: validados, del encargo y del alcance
-- ---------------------------------------------------------------------------
create function privado.registros_del_alcance(
  p_encargo uuid, p_tipo text, p_alcance uuid, p_registros uuid[]
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
      from unnest(p_registros) as x(id)
      left join public.registro r on r.id = x.id and r.encargo_id = p_encargo
     where r.id is null
        or r.estado_validacion not in ('validado', 'corregido')
        or (p_tipo = 'expediente' and r.expediente_id is distinct from p_alcance)
        or (p_tipo = 'entidad' and not exists (
              select 1 from public.registro_entidad re
                join public.entidad e on e.id = re.entidad_id
               where re.registro_id = r.id
                 and (e.id = p_alcance or e.fusionada_en = p_alcance)))
  );
$$;
revoke all on function privado.registros_del_alcance(uuid, text, uuid, uuid[]) from public, anon;
grant execute on function privado.registros_del_alcance(uuid, text, uuid, uuid[]) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Candados de la síntesis
-- ---------------------------------------------------------------------------
create function privado.sintesis_candados()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.estado <> 'generando' or new.aprobada_en is not null or new.proveedor is not null then
      raise exception 'una síntesis nace generándose' using errcode = '23514';
    end if;
    if not privado.registros_del_alcance(new.encargo_id, new.alcance_tipo, new.alcance_id, new.registros) then
      raise exception 'solo entran registros validados del alcance' using errcode = '23514';
    end if;
    return new;
  end if;

  if new.alcance_tipo is distinct from old.alcance_tipo or new.alcance_id is distinct from old.alcance_id
     or new.encargo_id is distinct from old.encargo_id or new.organizacion_id is distinct from old.organizacion_id
     or new.creado_por is distinct from old.creado_por then
    raise exception 'el alcance de una síntesis no cambia' using errcode = '23514';
  end if;
  if old.estado in ('aprobada', 'descartada') then
    raise exception 'la síntesis ya está %', old.estado using errcode = '23514';
  end if;
  -- El alcance solo se acota, nunca se amplía (para ampliarlo se genera otra síntesis).
  if not (new.registros <@ old.registros) then
    raise exception 'el alcance solo se puede reducir' using errcode = '23514';
  end if;

  -- Lo que escribe el procesador (service role) no pasa por las reglas de la pantalla.
  if current_user <> 'authenticated' then
    return new;
  end if;
  if new.proveedor is distinct from old.proveedor or new.modelo is distinct from old.modelo
     or new.generada_en is distinct from old.generada_en then
    raise exception 'la generación la registra el procesador' using errcode = '42501';
  end if;
  if new.registros is distinct from old.registros and old.estado <> 'borrador' then
    raise exception 'el alcance se reduce solo en borrador' using errcode = '23514';
  end if;
  if new.estado is distinct from old.estado then
    if not ((old.estado = 'borrador' and new.estado in ('aprobada', 'descartada'))
            or (old.estado in ('en_espera', 'error') and new.estado in ('generando', 'descartada'))
            or (old.estado = 'generando' and new.estado = 'descartada')) then
      raise exception 'cambio de estado no permitido: % → %', old.estado, new.estado using errcode = '23514';
    end if;
  end if;
  if new.estado = 'aprobada' then
    new.aprobada_por := (select auth.uid());
    new.aprobada_en := now();
  else
    new.aprobada_por := old.aprobada_por;
    new.aprobada_en := old.aprobada_en;
  end if;
  return new;
end;
$$;
create trigger sintesis_candados before insert or update on public.sintesis
  for each row execute function privado.sintesis_candados();
create trigger sintesis_solo_por_funcion before update on public.sintesis
  for each row execute function privado.solo_por_funcion();

create function privado.sintesis_bitacora()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.bitacora (organizacion_id, encargo_id, actor, accion, objeto_tipo, objeto_id, detalle)
    values (new.organizacion_id, new.encargo_id, (select auth.uid()), 'sintesis.alta', 'sintesis', new.id,
            jsonb_build_object('alcance_tipo', new.alcance_tipo, 'alcance_id', new.alcance_id,
                               'registros', cardinality(new.registros)));
  elsif new.estado is distinct from old.estado or new.registros is distinct from old.registros then
    insert into public.bitacora (organizacion_id, encargo_id, actor, accion, objeto_tipo, objeto_id, detalle)
    values (new.organizacion_id, new.encargo_id, (select auth.uid()),
            case when new.estado is distinct from old.estado then 'sintesis.' || new.estado
                 else 'sintesis.alcance' end,
            'sintesis', new.id,
            jsonb_strip_nulls(jsonb_build_object(
              'antes', old.estado, 'despues', new.estado, 'motivo', new.motivo,
              'proveedor', new.proveedor, 'modelo', new.modelo,
              'registros_antes', cardinality(old.registros), 'registros', cardinality(new.registros))));
  end if;
  return new;
end;
$$;
create trigger sintesis_bitacora after insert or update on public.sintesis
  for each row execute function privado.sintesis_bitacora();

-- ---------------------------------------------------------------------------
-- Candados de las afirmaciones: toda afirmación cita registros validados del alcance
-- ---------------------------------------------------------------------------
create function privado.afirmacion_candados()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.sintesis%rowtype;
  v_rol text := (select current_setting('role', true));
begin
  if tg_op = 'DELETE' then
    select * into s from public.sintesis where id = old.sintesis_id;
    if old.version <> 'borrador' or s.estado <> 'borrador' then
      raise exception 'solo se reemplaza el borrador' using errcode = '23514';
    end if;
    return old;
  end if;

  select * into s from public.sintesis where id = new.sintesis_id and encargo_id = new.encargo_id;
  if not found then
    raise exception 'síntesis inexistente' using errcode = 'P0002';
  end if;
  -- `role` refleja a quien llama aunque esta función corra como dueño.
  if new.version = 'ia' and v_rol = 'authenticated' then
    raise exception 'la versión de la IA la escribe el procesador' using errcode = '42501';
  end if;
  if (new.version = 'ia' and s.estado <> 'generando')
     or (new.version = 'borrador' and s.estado not in ('generando', 'borrador'))
     or (new.version = 'aprobada' and s.estado <> 'borrador') then
    raise exception 'la síntesis está % y no admite afirmaciones %', s.estado, new.version using errcode = '23514';
  end if;
  if not (new.registros <@ s.registros) then
    raise exception 'la afirmación cita registros fuera del alcance' using errcode = '23514';
  end if;
  if not privado.registros_del_alcance(s.encargo_id, s.alcance_tipo, s.alcance_id, new.registros) then
    raise exception 'la afirmación cita registros sin validar' using errcode = '23514';
  end if;
  new.organizacion_id := s.organizacion_id;
  new.texto := trim(new.texto);
  return new;
end;
$$;
create trigger afirmacion_candados before insert or delete on public.afirmacion
  for each row execute function privado.afirmacion_candados();

-- ---------------------------------------------------------------------------
-- Hallazgos: firmado = inmutable (pendiente de la tarea 13) y bitácora
-- ---------------------------------------------------------------------------
create function privado.hallazgo_candados()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.firmado_en is not null then
    raise exception 'el hallazgo ya está firmado' using errcode = '23514';
  end if;
  if new.encargo_id is distinct from old.encargo_id or new.organizacion_id is distinct from old.organizacion_id then
    raise exception 'el hallazgo no cambia de encargo' using errcode = '23514';
  end if;
  if new.firmado_en is not null then
    if current_user = 'authenticated' then
      new.firmado_por := (select auth.uid());
    end if;
    new.firmado_en := now();
  else
    new.firmado_por := null;
  end if;
  return new;
end;
$$;
create trigger hallazgo_candados before update on public.hallazgo
  for each row execute function privado.hallazgo_candados();
create trigger hallazgo_bitacora_alta after insert on public.hallazgo
  for each row execute function privado.escribir_bitacora('hallazgo.alta');
create trigger hallazgo_bitacora_cambio after update on public.hallazgo
  for each row execute function privado.escribir_bitacora('hallazgo.cambio', 'firmado_en', 'firmado_por');

create function privado.hallazgo_sintesis_candados()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.sintesis where id = new.sintesis_id and estado = 'aprobada') then
    raise exception 'solo se adjunta una síntesis aprobada' using errcode = '23514';
  end if;
  if exists (select 1 from public.hallazgo where id = new.hallazgo_id and firmado_en is not null) then
    raise exception 'el hallazgo ya está firmado' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger hallazgo_sintesis_candados before insert on public.hallazgo_sintesis
  for each row execute function privado.hallazgo_sintesis_candados();
create trigger hallazgo_sintesis_bitacora after insert on public.hallazgo_sintesis
  for each row execute function privado.escribir_bitacora('hallazgo.sintesis', 'hallazgo_id', 'sintesis_id');

revoke all on function privado.sintesis_candados() from public, anon;
revoke all on function privado.sintesis_bitacora() from public, anon;
revoke all on function privado.afirmacion_candados() from public, anon;
revoke all on function privado.hallazgo_candados() from public, anon;
revoke all on function privado.hallazgo_sintesis_candados() from public, anon;

-- ---------------------------------------------------------------------------
-- Funciones (SECURITY INVOKER: RLS y los candados deciden)
-- ---------------------------------------------------------------------------

-- Crea la síntesis y encola su generación.
create function public.crear_sintesis(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_encargo uuid := (p ->> 'encargo_id')::uuid;
  v_org uuid;
  v_id uuid;
  v_registros uuid[] := array(select distinct x::uuid from jsonb_array_elements_text(p -> 'registros') x);
begin
  select organizacion_id into v_org from public.encargo where id = v_encargo;
  if not found then
    raise exception 'encargo inexistente' using errcode = 'P0002';
  end if;
  if not public.es_miembro(v_org, '{admin,auditor}') then
    raise exception 'tu rol no permite generar síntesis' using errcode = '42501';
  end if;
  if cardinality(v_registros) = 0 then
    raise exception 'elige al menos un registro' using errcode = '23514';
  end if;
  insert into public.sintesis (organizacion_id, encargo_id, alcance_tipo, alcance_id, registros)
  values (v_org, v_encargo, p ->> 'alcance_tipo', (p ->> 'alcance_id')::uuid, v_registros)
  returning id into v_id;
  insert into public.trabajo (organizacion_id, encargo_id, tipo, payload)
  values (v_org, v_encargo, 'sintesis', jsonb_build_object('sintesis_id', v_id));
  return v_id;
end;
$$;

-- Lo que devolvió la IA (solo el procesador). Las afirmaciones ya vienen filtradas por la app; los
-- candados vuelven a verificar cada cita.
create function public.guardar_sintesis_ia(p jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s public.sintesis%rowtype;
  a jsonb;
  i int := 0;
begin
  select * into s from public.sintesis where id = (p ->> 'sintesis_id')::uuid for update;
  if not found or s.estado <> 'generando' then
    return;
  end if;
  if p ->> 'estado' in ('en_espera', 'error') then
    update public.sintesis set estado = p ->> 'estado', motivo = left(p ->> 'motivo', 500) where id = s.id;
    return;
  end if;
  for a in select * from jsonb_array_elements(coalesce(p -> 'afirmaciones', '[]'::jsonb)) loop
    i := i + 1;
    insert into public.afirmacion (organizacion_id, encargo_id, sintesis_id, version, orden, texto, registros)
    select s.organizacion_id, s.encargo_id, s.id, v, i, a ->> 'texto',
           array(select x::uuid from jsonb_array_elements_text(a -> 'registros') x)
      from unnest(array['ia', 'borrador']) v;
  end loop;
  update public.sintesis
     set estado = 'borrador',
         motivo = case when i = 0 then 'sin_afirmaciones' end,
         proveedor = p ->> 'proveedor',
         modelo = p ->> 'modelo',
         generada_en = now()
   where id = s.id;
end;
$$;
revoke all on function public.guardar_sintesis_ia(jsonb) from public, anon, authenticated;
grant execute on function public.guardar_sintesis_ia(jsonb) to service_role;

-- Reemplaza el borrador (y opcionalmente reduce el alcance). Con p_aprobar, además lo aprueba.
create function public.guardar_borrador_sintesis(
  p_sintesis uuid, p_afirmaciones jsonb, p_registros uuid[] default null, p_aprobar boolean default false
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s public.sintesis%rowtype;
  a jsonb;
  i int := 0;
begin
  select * into s from public.sintesis where id = p_sintesis for update;
  if not found then
    raise exception 'síntesis inexistente' using errcode = 'P0002';
  end if;
  if not public.es_miembro(s.organizacion_id, '{admin,auditor}') then
    raise exception 'tu rol no permite editar síntesis' using errcode = '42501';
  end if;
  if s.estado <> 'borrador' then
    raise exception 'la síntesis no está en borrador' using errcode = '23514';
  end if;
  if p_registros is not null and p_registros is distinct from s.registros then
    update public.sintesis set registros = p_registros where id = s.id;
    s.registros := p_registros;
  end if;
  delete from public.afirmacion where sintesis_id = s.id and version = 'borrador';
  for a in select * from jsonb_array_elements(coalesce(p_afirmaciones, '[]'::jsonb)) loop
    i := i + 1;
    insert into public.afirmacion (organizacion_id, encargo_id, sintesis_id, version, orden, texto, registros)
    values (s.organizacion_id, s.encargo_id, s.id, 'borrador', i, a ->> 'texto',
            array(select x::uuid from jsonb_array_elements_text(a -> 'registros') x));
  end loop;
  if p_aprobar then
    if i = 0 then
      raise exception 'una síntesis sin afirmaciones no se aprueba' using errcode = '23514';
    end if;
    insert into public.afirmacion (organizacion_id, encargo_id, sintesis_id, version, orden, texto, registros)
    select organizacion_id, encargo_id, sintesis_id, 'aprobada', orden, texto, registros
      from public.afirmacion where sintesis_id = s.id and version = 'borrador';
    update public.sintesis set estado = 'aprobada' where id = s.id;
  end if;
end;
$$;

create function public.descartar_sintesis(p_sintesis uuid, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'escribe el motivo (al menos 5 caracteres)' using errcode = '23514';
  end if;
  update public.sintesis set estado = 'descartada', motivo = left(trim(p_motivo), 500)
   where id = p_sintesis;
  if not found then
    raise exception 'síntesis inexistente o sin permiso' using errcode = '42501';
  end if;
end;
$$;

create function public.reintentar_sintesis(p_sintesis uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  s public.sintesis%rowtype;
begin
  update public.sintesis set estado = 'generando', motivo = null
   where id = p_sintesis and estado in ('en_espera', 'error')
  returning * into s;
  if not found then
    raise exception 'la síntesis no espera reintento o no tienes permiso' using errcode = '23514';
  end if;
  insert into public.trabajo (organizacion_id, encargo_id, tipo, payload)
  values (s.organizacion_id, s.encargo_id, 'sintesis', jsonb_build_object('sintesis_id', s.id));
end;
$$;

-- Hallazgo redactado por el auditor, con una síntesis aprobada adjunta si se indica.
create function public.crear_hallazgo(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_encargo uuid := (p ->> 'encargo_id')::uuid;
  v_org uuid;
  v_id uuid;
begin
  select organizacion_id into v_org from public.encargo where id = v_encargo;
  if not found then
    raise exception 'encargo inexistente' using errcode = 'P0002';
  end if;
  if length(trim(coalesce(p ->> 'redaccion', ''))) < 20 then
    raise exception 'la redacción necesita al menos 20 caracteres' using errcode = '23514';
  end if;
  insert into public.hallazgo (organizacion_id, encargo_id, redaccion)
  values (v_org, v_encargo, trim(p ->> 'redaccion'))
  returning id into v_id;
  if nullif(p ->> 'sintesis_id', '') is not null then
    insert into public.hallazgo_sintesis (organizacion_id, encargo_id, hallazgo_id, sintesis_id)
    values (v_org, v_encargo, v_id, (p ->> 'sintesis_id')::uuid);
  end if;
  return v_id;
end;
$$;

revoke all on function public.crear_sintesis(jsonb) from public, anon;
revoke all on function public.guardar_borrador_sintesis(uuid, jsonb, uuid[], boolean) from public, anon;
revoke all on function public.descartar_sintesis(uuid, text) from public, anon;
revoke all on function public.reintentar_sintesis(uuid) from public, anon;
revoke all on function public.crear_hallazgo(jsonb) from public, anon;
grant execute on function public.crear_sintesis(jsonb) to authenticated;
grant execute on function public.guardar_borrador_sintesis(uuid, jsonb, uuid[], boolean) to authenticated;
grant execute on function public.descartar_sintesis(uuid, text) to authenticated;
grant execute on function public.reintentar_sintesis(uuid) to authenticated;
grant execute on function public.crear_hallazgo(jsonb) to authenticated;
