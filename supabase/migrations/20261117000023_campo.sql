-- Tarea 14 · Verificación en campo (existencia del proveedor).
--
-- Un auditor arma el programa de trabajo desde la red calificada: visitas a proveedores de riesgo
-- con su domicilio y los documentos que los mencionan. Un verificador (o un auditor) la hace con el
-- teléfono, aun sin señal: contesta la cédula y toma fotos con ubicación, hora y SHA-256. Al
-- sincronizar, la cédula se vuelve un registro de origen «campo» y cada «no» genera una alerta R12.
--
-- Rol nuevo `verificador`: solo ve las visitas que tiene asignadas, a través de funciones; no lee
-- nada más de la organización.

-- ---------------------------------------------------------------------------
-- 1. Rol verificador
-- ---------------------------------------------------------------------------
alter table public.miembro drop constraint miembro_rol_check;
alter table public.miembro add constraint miembro_rol_check
  check (rol in ('admin', 'auditor', 'lector', 'verificador'));

-- Sin roles explícitos, «miembro» significa admin, auditor o lector: el verificador no lee la
-- organización. Para incluirlo hay que pedirlo ('{verificador}').
create or replace function privado.es_miembro(p_organizacion_id uuid, p_roles text[] default null)
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
      and (case when p_roles is null then m.rol <> 'verificador' else m.rol = any (p_roles) end)
  );
$$;

create or replace function privado.mis_organizaciones(p_roles text[] default null)
returns uuid[]
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(array_agg(m.organizacion_id), '{}'::uuid[])
    from public.miembro m
   where m.usuario_id = (select auth.uid())
     and m.activo
     and (case when p_roles is null then m.rol <> 'verificador' else m.rol = any (p_roles) end);
$$;

-- El verificador sí ve su propia membresía y el nombre de su organización (para entrar).
alter policy miembro_select on public.miembro
  using (organizacion_id = any ((select privado.mis_organizaciones())::uuid[])
         or (usuario_id = (select auth.uid()) and activo));
alter policy organizacion_select on public.organizacion
  using (id = any ((select privado.mis_organizaciones())::uuid[])
         or id = any ((select privado.mis_organizaciones('{verificador}'))::uuid[]));

-- ---------------------------------------------------------------------------
-- 2. Registro de origen «campo»
-- ---------------------------------------------------------------------------
alter table public.registro drop constraint registro_origen_check;
alter table public.registro add constraint registro_origen_check
  check (origen in ('documento', 'captura', 'importacion', 'campo'));
alter table public.registro add constraint registro_campo_fuente
  check (origen <> 'campo' or length(trim(coalesce(fuente, ''))) > 0);

-- ---------------------------------------------------------------------------
-- 3. Tablas
-- ---------------------------------------------------------------------------
create table public.visita_campo (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,
  encargo_id uuid not null,
  entidad_id uuid not null,
  verificador_id uuid not null references auth.users (id),
  estado text not null default 'asignada' check (estado in ('asignada', 'verificada', 'cancelada')),
  nivel text check (nivel is null or nivel in ('critico', 'alto', 'medio', 'bajo')),
  puntaje numeric(6, 2),
  domicilios text[] not null default '{}' check (cardinality(domicilios) <= 10),
  documentos jsonb not null default '[]'::jsonb check (jsonb_typeof(documentos) = 'array'),
  instrucciones text check (instrucciones is null or length(instrucciones) <= 1000),
  motivo text check (motivo is null or length(motivo) <= 500),
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (organizacion_id, encargo_id) references public.encargo (organizacion_id, id),
  foreign key (encargo_id, entidad_id) references public.entidad (encargo_id, id),
  unique (encargo_id, id)
);
create unique index visita_campo_entidad_activa on public.visita_campo (encargo_id, entidad_id)
  where estado = 'asignada';
create index visita_campo_verificador_idx on public.visita_campo (verificador_id, estado);
create index visita_campo_organizacion_encargo_idx on public.visita_campo (organizacion_id, encargo_id);
create index visita_campo_creado_por_idx on public.visita_campo (creado_por);

create table public.cedula_campo (
  -- El ID lo genera el teléfono: reenviar la misma cédula no la duplica.
  id uuid primary key,
  organizacion_id uuid not null,
  encargo_id uuid not null,
  visita_id uuid not null unique,
  registro_id uuid not null,
  respuestas jsonb not null check (jsonb_typeof(respuestas) = 'object'),
  domicilio_observado text check (domicilio_observado is null or length(domicilio_observado) <= 500),
  observaciones text check (observaciones is null or length(observaciones) <= 4000),
  latitud numeric(9, 6) check (latitud between -90 and 90),
  longitud numeric(9, 6) check (longitud between -180 and 180),
  precision_m numeric(8, 1) check (precision_m >= 0),
  capturada_en timestamptz not null,
  recibida_en timestamptz not null default now(),
  autor uuid not null references auth.users (id),
  foreign key (organizacion_id, encargo_id) references public.encargo (organizacion_id, id),
  foreign key (encargo_id, visita_id) references public.visita_campo (encargo_id, id),
  foreign key (encargo_id, registro_id) references public.registro (encargo_id, id),
  unique (encargo_id, id)
);
create index cedula_campo_organizacion_encargo_idx on public.cedula_campo (organizacion_id, encargo_id);
create index cedula_campo_registro_idx on public.cedula_campo (encargo_id, registro_id);
create index cedula_campo_autor_idx on public.cedula_campo (autor);

create table public.evidencia_campo (
  id uuid primary key,
  organizacion_id uuid not null,
  encargo_id uuid not null,
  visita_id uuid not null,
  cedula_id uuid,
  ruta text not null unique,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  bytes bigint not null check (bytes > 0 and bytes <= 15728640),
  mime text not null check (mime in ('image/jpeg', 'image/png', 'image/webp', 'image/heic')),
  latitud numeric(9, 6) check (latitud between -90 and 90),
  longitud numeric(9, 6) check (longitud between -180 and 180),
  precision_m numeric(8, 1) check (precision_m >= 0),
  capturada_en timestamptz not null,
  recibida_en timestamptz not null default now(),
  autor uuid not null references auth.users (id),
  foreign key (organizacion_id, encargo_id) references public.encargo (organizacion_id, id),
  foreign key (encargo_id, visita_id) references public.visita_campo (encargo_id, id),
  foreign key (encargo_id, cedula_id) references public.cedula_campo (encargo_id, id)
);
create index evidencia_campo_visita_idx on public.evidencia_campo (encargo_id, visita_id);
create index evidencia_campo_cedula_idx on public.evidencia_campo (encargo_id, cedula_id);
create index evidencia_campo_organizacion_encargo_idx on public.evidencia_campo (organizacion_id, encargo_id);
create index evidencia_campo_autor_idx on public.evidencia_campo (autor);

create table public.aviso_aceptacion (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizacion (id),
  usuario_id uuid not null references auth.users (id) on delete cascade,
  aviso text not null check (aviso in ('campo_confidencialidad')),
  version text not null check (version ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'),
  aceptado_en timestamptz not null default now(),
  unique (organizacion_id, usuario_id, aviso, version)
);
create index aviso_aceptacion_usuario_idx on public.aviso_aceptacion (usuario_id);

-- RLS: el verificador no tiene políticas; todo lo suyo pasa por funciones.
select privado.aplicar_rls('public.visita_campo', '{admin,auditor}', true, false);
select privado.aplicar_rls('public.cedula_campo', '{admin,auditor}', false, false);
select privado.aplicar_rls('public.evidencia_campo', '{admin,auditor}', false, false);
-- Cédulas y evidencias solo las escriben las funciones (con la verificación de la visita).
revoke insert on public.cedula_campo, public.evidencia_campo from authenticated;
-- Las visitas se crean y cancelan por funciones (un PATCH directo no cambia el estado).
create trigger visita_campo_solo_por_funcion before update on public.visita_campo
  for each row execute function privado.solo_por_funcion();

alter table public.aviso_aceptacion enable row level security;
revoke all on public.aviso_aceptacion from anon, authenticated;
grant select on public.aviso_aceptacion to authenticated;
create policy aviso_aceptacion_select on public.aviso_aceptacion for select to authenticated
  using (usuario_id = (select auth.uid())
         or organizacion_id = any ((select privado.mis_organizaciones('{admin}'))::uuid[]));

create trigger visita_campo_bitacora_alta after insert on public.visita_campo
  for each row execute function privado.escribir_bitacora('campo.visita', 'entidad_id', 'verificador_id');
create trigger visita_campo_bitacora_cambio after update on public.visita_campo
  for each row execute function privado.escribir_bitacora('campo.visita_cambio', 'estado', 'verificador_id');

-- ---------------------------------------------------------------------------
-- 4. Bucket privado para las fotos (sin UPDATE ni DELETE)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('campo', 'campo', false, 15728640, array['image/jpeg', 'image/png', 'image/webp', 'image/heic'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Ruta: <organización>/<encargo>/<visita>/<evidencia>.<ext>
create function privado.visita_de_ruta(p_ruta text)
returns public.visita_campo
language sql
stable
security definer
set search_path = ''
as $$
  select v.*
    from public.visita_campo v
   where p_ruta ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|heic)$'
     and v.organizacion_id = split_part(p_ruta, '/', 1)::uuid
     and v.encargo_id = split_part(p_ruta, '/', 2)::uuid
     and v.id = split_part(p_ruta, '/', 3)::uuid;
$$;

create function privado.puede_subir_campo(p_ruta text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.visita_campo;
begin
  v := privado.visita_de_ruta(p_ruta);
  if v.id is null or v.estado <> 'asignada' then
    return false;
  end if;
  return (v.verificador_id = (select auth.uid()) and privado.es_miembro(v.organizacion_id, '{admin,auditor,verificador}'))
      or privado.es_miembro(v.organizacion_id, '{admin,auditor}');
end;
$$;

create function privado.puede_ver_campo(p_ruta text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.visita_campo;
begin
  v := privado.visita_de_ruta(p_ruta);
  if v.id is null then
    return false;
  end if;
  return privado.es_miembro(v.organizacion_id)
      or (v.verificador_id = (select auth.uid()) and privado.es_miembro(v.organizacion_id, '{admin,auditor,verificador}'));
end;
$$;
revoke all on function privado.visita_de_ruta(text) from public, anon;
revoke all on function privado.puede_subir_campo(text) from public, anon;
revoke all on function privado.puede_ver_campo(text) from public, anon;
grant execute on function privado.puede_subir_campo(text) to authenticated;
grant execute on function privado.puede_ver_campo(text) to authenticated;

create policy campo_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'campo' and (select privado.puede_subir_campo(name)));
create policy campo_select on storage.objects for select to authenticated
  using (bucket_id = 'campo' and (select privado.puede_ver_campo(name)));

-- ---------------------------------------------------------------------------
-- 5. Aviso de confidencialidad y protección de datos
-- ---------------------------------------------------------------------------
-- Cambiar el texto del aviso en la app exige subir esta versión: todos vuelven a aceptarlo.
create function privado.version_aviso_campo()
returns text
language sql
immutable
set search_path = ''
as $$ select '2026-11-17' $$;
revoke all on function privado.version_aviso_campo() from public, anon;
grant execute on function privado.version_aviso_campo() to authenticated, service_role;

create function public.aceptar_aviso_campo(p_organizacion uuid, p_version text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not privado.es_miembro(p_organizacion, '{admin,auditor,verificador}') then
    raise exception 'no perteneces a la organización' using errcode = '42501';
  end if;
  if p_version is distinct from privado.version_aviso_campo() then
    raise exception 'versión del aviso desactualizada: recarga la página' using errcode = '23514';
  end if;
  insert into public.aviso_aceptacion (organizacion_id, usuario_id, aviso, version)
  values (p_organizacion, (select auth.uid()), 'campo_confidencialidad', p_version)
  on conflict do nothing;
  insert into public.bitacora (organizacion_id, actor, accion, objeto_tipo, objeto_id, detalle)
  values (p_organizacion, (select auth.uid()), 'campo.aviso', 'usuario', (select auth.uid()),
          jsonb_build_object('aviso', 'campo_confidencialidad', 'version', p_version));
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Programa de trabajo (auditor)
-- ---------------------------------------------------------------------------
-- Visitas a las entidades elegidas, con domicilios y documentos prellenados de lo validado.
create function public.crear_visitas(p jsonb)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_encargo uuid := (p ->> 'encargo_id')::uuid;
  v_verificador uuid := (p ->> 'verificador_id')::uuid;
  v_org uuid;
  v_red uuid;
  v_entidad uuid;
  v_n int := 0;
begin
  select organizacion_id into v_org from public.encargo where id = v_encargo;
  if not found then
    raise exception 'encargo inexistente' using errcode = 'P0002';
  end if;
  if not public.es_miembro(v_org, '{admin,auditor}') then
    raise exception 'tu rol no permite programar visitas' using errcode = '42501';
  end if;
  if not exists (select 1 from public.miembro m where m.organizacion_id = v_org and m.usuario_id = v_verificador
                  and m.activo and m.rol in ('admin', 'auditor', 'verificador')) then
    raise exception 'quien verifica debe ser auditor o verificador activo de la organización' using errcode = '23514';
  end if;
  select g.id into v_red from public.red_generada g where g.encargo_id = v_encargo order by g.generada_en desc limit 1;

  for v_entidad in select distinct x::uuid from jsonb_array_elements_text(p -> 'entidades') x loop
    if exists (select 1 from public.visita_campo where encargo_id = v_encargo and entidad_id = v_entidad and estado = 'asignada') then
      continue;
    end if;
    insert into public.visita_campo (organizacion_id, encargo_id, entidad_id, verificador_id, nivel, puntaje,
                                     domicilios, documentos, instrucciones)
    select v_org, v_encargo, e.id, v_verificador,
           coalesce(c.ajuste_nivel, c.nivel), c.puntaje,
           -- Domicilios: entidades «domicilio» vinculadas y el dato «domicilio» validado de sus registros.
           array(select distinct d from (
                   select de.nombre as d
                     from public.vinculo vi
                     join public.entidad de on de.id = case when vi.origen_id = e.id then vi.destino_id else vi.origen_id end
                    where vi.encargo_id = v_encargo and (vi.origen_id = e.id or vi.destino_id = e.id)
                      and de.tipo = 'domicilio'
                   union
                   select x.valor_crudo
                     from public.registro_entidad re
                     join public.extraccion x on x.registro_id = re.registro_id
                    where re.encargo_id = v_encargo and re.entidad_id = e.id
                      and x.campo = 'domicilio' and x.estado in ('validado', 'corregido')
                      and length(trim(coalesce(x.valor_crudo, ''))) > 0
                 ) ds limit 10),
           coalesce((
             select jsonb_agg(doc order by doc ->> 'fecha' nulls last)
               from (
                 select jsonb_build_object(
                          'registro_id', r.id,
                          'tipo', td.nombre,
                          'fecha', r.fecha_documento,
                          'resumen', left(r.resumen, 200),
                          'monto', (select x.valor_normalizado from public.extraccion x
                                     where x.registro_id = r.id and x.campo = 'monto'
                                       and x.estado in ('validado', 'corregido') limit 1)) as doc
                   from public.registro_entidad re
                   join public.registro r on r.id = re.registro_id
                   left join public.tipo_documento td on td.id = r.tipo_documento_id
                  where re.encargo_id = v_encargo and re.entidad_id = e.id
                    and r.estado_validacion in ('validado', 'corregido') and r.origen <> 'campo'
                  limit 20
               ) docs), '[]'::jsonb),
           nullif(trim(p ->> 'instrucciones'), '')
      from public.entidad e
      left join public.calificacion c on c.red_id = v_red and c.objeto_tipo = 'entidad' and c.objeto_id = e.id
     where e.id = v_entidad and e.encargo_id = v_encargo and e.fusionada_en is null
       and e.tipo in ('persona_moral', 'persona_fisica');
    if found then
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end;
$$;

create function public.cancelar_visita(p_visita uuid, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if length(trim(coalesce(p_motivo, ''))) < 5 then
    raise exception 'escribe el motivo (al menos 5 caracteres)' using errcode = '23514';
  end if;
  update public.visita_campo set estado = 'cancelada', motivo = left(trim(p_motivo), 500)
   where id = p_visita and estado = 'asignada';
  if not found then
    raise exception 'la visita no está asignada o no tienes permiso' using errcode = '42501';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Funciones del teléfono (verificador o auditor asignado)
-- ---------------------------------------------------------------------------

-- Visitas asignadas a quien llama, con lo necesario para trabajar sin señal. Exige el aviso aceptado.
create function public.campo_mis_visitas()
returns table (
  visita_id uuid, organizacion_id uuid, organizacion text, encargo_id uuid, encargo text,
  entidad_id uuid, entidad text, entidad_tipo text, rfc text, nivel text, domicilios text[],
  documentos jsonb, instrucciones text, aviso_aceptado boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select v.id, v.organizacion_id, o.nombre, v.encargo_id, en.nombre, e.id, e.nombre, e.tipo,
         e.identificadores ->> 'rfc', v.nivel, v.domicilios,
         case when a.id is null then '[]'::jsonb else v.documentos end,
         v.instrucciones, a.id is not null
    from public.visita_campo v
    join public.miembro m on m.organizacion_id = v.organizacion_id and m.usuario_id = (select auth.uid())
     and m.activo and m.rol in ('admin', 'auditor', 'verificador')
    join public.organizacion o on o.id = v.organizacion_id
    join public.encargo en on en.id = v.encargo_id
    join public.entidad e on e.id = v.entidad_id
    left join public.aviso_aceptacion a on a.organizacion_id = v.organizacion_id
     and a.usuario_id = (select auth.uid()) and a.aviso = 'campo_confidencialidad'
     and a.version = privado.version_aviso_campo()
   where v.verificador_id = (select auth.uid()) and v.estado = 'asignada'
   order by o.nombre, en.nombre, e.nombre;
$$;

create function privado.visita_asignada(p_visita uuid)
returns public.visita_campo
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v public.visita_campo;
begin
  select * into v from public.visita_campo where id = p_visita;
  if v.id is null or v.verificador_id <> (select auth.uid())
     or not privado.es_miembro(v.organizacion_id, '{admin,auditor,verificador}') then
    raise exception 'la visita no está asignada a ti' using errcode = '42501';
  end if;
  if not exists (select 1 from public.aviso_aceptacion a where a.organizacion_id = v.organizacion_id
                  and a.usuario_id = (select auth.uid()) and a.aviso = 'campo_confidencialidad'
                  and a.version = privado.version_aviso_campo()) then
    raise exception 'acepta el aviso de confidencialidad antes de verificar' using errcode = '42501';
  end if;
  return v;
end;
$$;
revoke all on function privado.visita_asignada(uuid) from public, anon;
grant execute on function privado.visita_asignada(uuid) to authenticated;

-- Foto ya subida al bucket: la app recalculó su SHA-256 antes de llamar. Reenviarla no la duplica.
create function public.campo_registrar_evidencia(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.visita_campo;
  v_id uuid := (p ->> 'id')::uuid;
  v_ruta text := p ->> 'ruta';
  previa public.evidencia_campo;
begin
  v := privado.visita_asignada((p ->> 'visita_id')::uuid);
  select * into previa from public.evidencia_campo where id = v_id;
  if previa.id is not null then
    if previa.sha256 <> p ->> 'sha256' or previa.visita_id <> v.id then
      raise exception 'evidencia repetida con otro contenido' using errcode = '23505';
    end if;
    return;
  end if;
  if v.estado <> 'asignada' then
    raise exception 'la visita ya no está abierta' using errcode = '23514';
  end if;
  if split_part(v_ruta, '/', 1)::uuid <> v.organizacion_id or split_part(v_ruta, '/', 2)::uuid <> v.encargo_id
     or split_part(v_ruta, '/', 3)::uuid <> v.id or split_part(split_part(v_ruta, '/', 4), '.', 1)::uuid <> v_id then
    raise exception 'ruta de evidencia inválida' using errcode = '23514';
  end if;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'campo' and o.name = v_ruta) then
    raise exception 'la foto no está en el almacén' using errcode = 'P0002';
  end if;
  insert into public.evidencia_campo (id, organizacion_id, encargo_id, visita_id, ruta, sha256, bytes, mime,
                                      latitud, longitud, precision_m, capturada_en, autor)
  values (v_id, v.organizacion_id, v.encargo_id, v.id, v_ruta, p ->> 'sha256', (p ->> 'bytes')::bigint,
          p ->> 'mime', (p ->> 'latitud')::numeric, (p ->> 'longitud')::numeric,
          (p ->> 'precision_m')::numeric, (p ->> 'capturada_en')::timestamptz, (select auth.uid()));
  insert into public.bitacora (organizacion_id, encargo_id, actor, accion, objeto_tipo, objeto_id, detalle)
  values (v.organizacion_id, v.encargo_id, (select auth.uid()), 'campo.evidencia', 'evidencia_campo', v_id,
          jsonb_build_object('visita_id', v.id, 'sha256', p ->> 'sha256', 'bytes', (p ->> 'bytes')::bigint,
                             'con_ubicacion', p ? 'latitud' and p ->> 'latitud' is not null));
end;
$$;

-- Cédula contestada: se vuelve un registro «campo» validado por quien verificó; cierra la visita y
-- pide correr las reglas (R12). Reenviar la misma cédula no hace nada.
create function public.campo_guardar_cedula(p jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.visita_campo;
  v_id uuid := (p ->> 'id')::uuid;
  v_registro uuid;
  v_entidad text;
  v_no int;
  previa public.cedula_campo;
  claves constant text[] := array['domicilio_existe', 'inmueble_existe', 'proveedor_presente',
                                  'actividad_visible', 'persona_confirma'];
begin
  select * into previa from public.cedula_campo where id = v_id;
  if previa.id is not null then
    return previa.registro_id;
  end if;
  v := privado.visita_asignada((p ->> 'visita_id')::uuid);
  if v.estado <> 'asignada' then
    raise exception 'la visita ya no está abierta' using errcode = '23514';
  end if;
  if exists (select 1 from jsonb_each_text(p -> 'respuestas') r
              where not (r.key = any (claves)) or r.value not in ('si', 'no', 'no_verificable'))
     or (select count(*) from jsonb_object_keys(p -> 'respuestas')) <> cardinality(claves) then
    raise exception 'respuestas incompletas o inválidas' using errcode = '23514';
  end if;
  select nombre into v_entidad from public.entidad where id = v.entidad_id;
  select count(*) into v_no from jsonb_each_text(p -> 'respuestas') r where r.value = 'no';

  insert into public.registro (organizacion_id, encargo_id, origen, fuente, fecha_documento, estado_validacion,
                               estado_extraccion, resumen, creado_por)
  values (v.organizacion_id, v.encargo_id, 'campo',
          'Verificación en campo · visita ' || left(v.id::text, 8),
          ((p ->> 'capturada_en')::timestamptz at time zone 'America/Mexico_City')::date,
          'validado', 'no_aplica',
          left(format('Verificación en campo de %s: %s', v_entidad,
                      case when v_no = 0 then 'sin discrepancias' else v_no || ' respuesta(s) no coinciden' end), 255),
          (select auth.uid()))
  returning id into v_registro;
  insert into public.registro_entidad (organizacion_id, encargo_id, registro_id, entidad_id, rol)
  values (v.organizacion_id, v.encargo_id, v_registro, v.entidad_id, 'verificado');

  insert into public.cedula_campo (id, organizacion_id, encargo_id, visita_id, registro_id, respuestas,
                                   domicilio_observado, observaciones, latitud, longitud, precision_m,
                                   capturada_en, autor)
  values (v_id, v.organizacion_id, v.encargo_id, v.id, v_registro, p -> 'respuestas',
          nullif(trim(p ->> 'domicilio_observado'), ''), nullif(trim(p ->> 'observaciones'), ''),
          (p ->> 'latitud')::numeric, (p ->> 'longitud')::numeric, (p ->> 'precision_m')::numeric,
          (p ->> 'capturada_en')::timestamptz, (select auth.uid()));
  update public.evidencia_campo set cedula_id = v_id
   where visita_id = v.id and cedula_id is null
     and id in (select x::uuid from jsonb_array_elements_text(coalesce(p -> 'evidencias', '[]'::jsonb)) x);
  update public.visita_campo set estado = 'verificada' where id = v.id;
  insert into public.trabajo (organizacion_id, encargo_id, tipo, payload)
  values (v.organizacion_id, v.encargo_id, 'reglas', jsonb_build_object('encargo_id', v.encargo_id));
  insert into public.bitacora (organizacion_id, encargo_id, actor, accion, objeto_tipo, objeto_id, detalle)
  values (v.organizacion_id, v.encargo_id, (select auth.uid()), 'campo.cedula', 'cedula_campo', v_id,
          jsonb_build_object('visita_id', v.id, 'registro_id', v_registro, 'no_coincide', v_no,
                             'evidencias', jsonb_array_length(coalesce(p -> 'evidencias', '[]'::jsonb))));
  return v_registro;
end;
$$;

-- Quién puede hacer visitas (para asignarlas): el auditor no ve correos de la organización, así
-- que esta función le da solo los de admin, auditor y verificador activos.
create function public.verificadores_organizacion(p_organizacion uuid)
returns table (usuario_id uuid, correo text, rol text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not privado.es_miembro(p_organizacion, '{admin,auditor}') then
    raise exception 'tu rol no permite programar visitas' using errcode = '42501';
  end if;
  return query
    select m.usuario_id, u.email::text, m.rol
      from public.miembro m
      join auth.users u on u.id = m.usuario_id
     where m.organizacion_id = p_organizacion and m.activo and m.rol in ('admin', 'auditor', 'verificador')
     order by case m.rol when 'verificador' then 0 else 1 end, u.email;
end;
$$;
revoke all on function public.verificadores_organizacion(uuid) from public, anon;
grant execute on function public.verificadores_organizacion(uuid) to authenticated;

revoke all on function public.aceptar_aviso_campo(uuid, text) from public, anon;
revoke all on function public.crear_visitas(jsonb) from public, anon;
revoke all on function public.cancelar_visita(uuid, text) from public, anon;
revoke all on function public.campo_mis_visitas() from public, anon;
revoke all on function public.campo_registrar_evidencia(jsonb) from public, anon;
revoke all on function public.campo_guardar_cedula(jsonb) from public, anon;
grant execute on function public.aceptar_aviso_campo(uuid, text) to authenticated;
grant execute on function public.crear_visitas(jsonb) to authenticated;
grant execute on function public.cancelar_visita(uuid, text) to authenticated;
grant execute on function public.campo_mis_visitas() to authenticated;
grant execute on function public.campo_registrar_evidencia(jsonb) to authenticated;
grant execute on function public.campo_guardar_cedula(jsonb) to authenticated;

-- Las funciones del teléfono son SECURITY DEFINER: como todas las demás, su cuerpo va en privado y
-- en public queda una envoltura invoker (tarea 13).
do $$
declare
  f record;
  llamada text;
  roles text;
begin
  for f in
    select p.oid, p.proname, p.proretset, p.provolatile, pg_get_function_arguments(p.oid) as args,
           pg_get_function_identity_arguments(p.oid) as ident, pg_get_function_result(p.oid) as res, p.pronargs
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prosecdef and p.prokind = 'f'
  loop
    select string_agg(distinct quote_ident(r.rolname), ', ') into roles
      from aclexplode((select proacl from pg_proc where oid = f.oid)) a
      join pg_roles r on r.oid = a.grantee
     where a.privilege_type = 'EXECUTE' and r.rolname in ('anon', 'authenticated', 'service_role');
    execute format('alter function public.%I(%s) set schema privado', f.proname, f.ident);
    execute format('revoke all on function privado.%I(%s) from public, anon, authenticated, service_role', f.proname, f.ident);
    if roles is not null then
      execute format('grant execute on function privado.%I(%s) to %s', f.proname, f.ident, roles);
    end if;
    select coalesce(string_agg('$' || i, ', '), '') into llamada from generate_series(1, f.pronargs) i;
    execute format(
      'create function public.%I(%s) returns %s language sql %s security invoker set search_path = '''' as %L',
      f.proname, f.args, f.res,
      case f.provolatile when 's' then 'stable' when 'i' then 'immutable' else 'volatile' end,
      case when f.proretset then format('select * from privado.%I(%s)', f.proname, llamada)
           else format('select privado.%I(%s)', f.proname, llamada) end);
    execute format('revoke all on function public.%I(%s) from public, anon, authenticated, service_role', f.proname, f.ident);
    if roles is not null then
      execute format('grant execute on function public.%I(%s) to %s', f.proname, f.ident, roles);
    end if;
  end loop;
end;
$$;
