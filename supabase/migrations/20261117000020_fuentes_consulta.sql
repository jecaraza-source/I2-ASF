-- Tarea 11 · Migración 20: ficha enriquecida — fuentes de consulta, lista 69-B y resultados.
-- docs/ESPECIFICACION.md §11.1.
--
--  * Cada organización tiene dos fuentes: «Otros expedientes» (interna) y «Lista 69-B del SAT»
--    (externa, pero consultada sobre una copia local: ningún dato sale de la plataforma).
--  * `carga_fuente`: cada carga de una lista (CSV o Excel), con su huella SHA-256. Las anteriores
--    se conservan como `reemplazada` para saber contra qué versión se encontró cada coincidencia.
--    `storage_path` queda listo para guardar el archivo original cuando se decida hacerlo.
--  * `lista_69b`: las filas de cada carga. Solo el administrador escribe.
--  * `resultado_consulta`: los resultados los escribe el procesador; el auditor solo confirma o
--    descarta (con motivo) e incorpora. Un resultado decidido no se reabre.

-- ---------------------------------------------------------------------------
-- Fuentes por organización.
-- ---------------------------------------------------------------------------
create unique index fuente_consulta_conector_idx on public.fuente_consulta (organizacion_id, conector);

create function privado.fuentes_iniciales()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.fuente_consulta (organizacion_id, nombre, tipo, conector, config)
  values (new.id, 'Otros expedientes', 'interna', 'otros_expedientes', '{}'::jsonb),
         (new.id, 'Lista 69-B del SAT', 'externa', 'lista_69b',
          '{"descripcion": "Contribuyentes publicados por el SAT (artículo 69-B del CFF). Se consulta sobre la copia cargada en la plataforma."}'::jsonb)
  on conflict (organizacion_id, conector) do nothing;
  return new;
end;
$$;
revoke all on function privado.fuentes_iniciales() from public, anon, authenticated;
create trigger organizacion_fuentes_iniciales
  after insert on public.organizacion
  for each row execute function privado.fuentes_iniciales();

insert into public.fuente_consulta (organizacion_id, nombre, tipo, conector, config)
select o.id, f.nombre, f.tipo, f.conector, f.config
  from public.organizacion o
  cross join (values
    ('Otros expedientes', 'interna', 'otros_expedientes', '{}'::jsonb),
    ('Lista 69-B del SAT', 'externa', 'lista_69b',
     '{"descripcion": "Contribuyentes publicados por el SAT (artículo 69-B del CFF). Se consulta sobre la copia cargada en la plataforma."}'::jsonb)
  ) f (nombre, tipo, conector, config)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Cargas de listas.
-- ---------------------------------------------------------------------------
create table public.carga_fuente (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,
  fuente_id uuid not null,
  nombre_archivo text not null check (length(trim(nombre_archivo)) between 1 and 255),
  formato text not null check (formato in ('csv', 'xlsx')),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  filas_esperadas int not null check (filas_esperadas between 1 and 200000),
  filas int not null default 0 check (filas >= 0),
  estado text not null default 'en_proceso' check (estado in ('en_proceso', 'vigente', 'reemplazada')),
  storage_path text,
  vigente_desde timestamptz,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (organizacion_id, fuente_id) references public.fuente_consulta (organizacion_id, id),
  unique (organizacion_id, id)
);
comment on column public.carga_fuente.storage_path is
  'Reservado: ruta del archivo original si en el futuro se guarda. Hoy se guarda solo su SHA-256.';
create index carga_fuente_fuente_idx on public.carga_fuente (organizacion_id, fuente_id, creado_en desc);
create unique index carga_fuente_vigente_idx on public.carga_fuente (fuente_id) where estado = 'vigente';
create index carga_fuente_creado_por_idx on public.carga_fuente (creado_por);
select privado.aplicar_rls('public.carga_fuente', '{admin}', true, false);

create table public.lista_69b (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,
  carga_id uuid not null,
  rfc text not null check (rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'),
  nombre text not null check (length(trim(nombre)) between 1 and 300),
  nombre_normalizado text not null,
  situacion text not null check (situacion in ('presunto', 'desvirtuado', 'definitivo', 'sentencia_favorable', 'otro')),
  datos jsonb not null default '{}'::jsonb check (jsonb_typeof(datos) = 'object'),
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (organizacion_id, carga_id) references public.carga_fuente (organizacion_id, id),
  unique (carga_id, rfc)
);
create index lista_69b_rfc_idx on public.lista_69b (carga_id, rfc);
create index lista_69b_nombre_idx on public.lista_69b (carga_id, nombre_normalizado);
create index lista_69b_organizacion_idx on public.lista_69b (organizacion_id);
create index lista_69b_creado_por_idx on public.lista_69b (creado_por);
select privado.aplicar_rls('public.lista_69b', '{admin}', false, false);

-- iniciar_carga_fuente: p = { fuente_id, nombre_archivo, formato, sha256, filas_esperadas }
create function public.iniciar_carga_fuente(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  f public.fuente_consulta;
  v_id uuid;
begin
  select * into f from public.fuente_consulta where id = (p ->> 'fuente_id')::uuid;
  if not found then
    raise exception 'fuente inexistente' using errcode = 'P0002';
  end if;
  if f.conector <> 'lista_69b' then
    raise exception 'esta fuente no admite cargas' using errcode = '22023';
  end if;
  -- Una carga a medias (navegador cerrado) se descarta al iniciar otra: nunca fue vigente.
  insert into public.carga_fuente (organizacion_id, fuente_id, nombre_archivo, formato, sha256, filas_esperadas)
  values (f.organizacion_id, f.id, left(p ->> 'nombre_archivo', 255), p ->> 'formato', p ->> 'sha256',
          (p ->> 'filas_esperadas')::int)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.iniciar_carga_fuente(jsonb) from public, anon;
grant execute on function public.iniciar_carga_fuente(jsonb) to authenticated;

-- agregar_lote_69b: filas = [{ rfc, nombre, nombre_normalizado, situacion, datos }]. Ya validadas
-- en el servidor; la base vuelve a exigir el formato. Un RFC repetido en la misma carga se ignora.
create function public.agregar_lote_69b(p_carga uuid, p_filas jsonb)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c public.carga_fuente;
  v_n int;
begin
  select * into c from public.carga_fuente where id = p_carga for update;
  if not found then
    raise exception 'carga inexistente' using errcode = 'P0002';
  end if;
  if c.estado <> 'en_proceso' then
    raise exception 'la carga ya se cerró' using errcode = '22023';
  end if;
  if jsonb_array_length(coalesce(p_filas, '[]'::jsonb)) > 5000 then
    raise exception 'lote demasiado grande' using errcode = '22023';
  end if;
  insert into public.lista_69b (organizacion_id, carga_id, rfc, nombre, nombre_normalizado, situacion, datos)
  select c.organizacion_id, c.id, x ->> 'rfc', left(x ->> 'nombre', 300), left(x ->> 'nombre_normalizado', 300),
         x ->> 'situacion', coalesce(x -> 'datos', '{}'::jsonb)
    from jsonb_array_elements(coalesce(p_filas, '[]'::jsonb)) x
  on conflict (carga_id, rfc) do nothing;
  get diagnostics v_n = row_count;
  update public.carga_fuente set filas = filas + v_n where id = c.id;
  return v_n;
end;
$$;
revoke all on function public.agregar_lote_69b(uuid, jsonb) from public, anon;
grant execute on function public.agregar_lote_69b(uuid, jsonb) to authenticated;

-- cerrar_carga_fuente: la carga pasa a vigente y la anterior a reemplazada. Queda en bitácora.
create function public.cerrar_carga_fuente(p_carga uuid)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  c public.carga_fuente;
begin
  select * into c from public.carga_fuente where id = p_carga for update;
  if not found then
    raise exception 'carga inexistente' using errcode = 'P0002';
  end if;
  if c.estado <> 'en_proceso' then
    raise exception 'la carga ya se cerró' using errcode = '22023';
  end if;
  if c.filas = 0 then
    raise exception 'sin_filas: la carga no tiene filas válidas' using errcode = '22023';
  end if;
  update public.carga_fuente set estado = 'reemplazada'
   where fuente_id = c.fuente_id and estado = 'vigente';
  update public.carga_fuente set estado = 'vigente', vigente_desde = now() where id = c.id;
  insert into public.bitacora (organizacion_id, actor, accion, objeto_tipo, objeto_id, detalle)
  values (c.organizacion_id, (select auth.uid()), 'fuente.carga', 'carga_fuente', c.id,
          jsonb_build_object('fuente_id', c.fuente_id, 'formato', c.formato, 'sha256', c.sha256,
                             'filas', c.filas, 'filas_esperadas', c.filas_esperadas));
  return c.filas;
end;
$$;
revoke all on function public.cerrar_carga_fuente(uuid) from public, anon;
grant execute on function public.cerrar_carga_fuente(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- resultado_consulta: huella, revisión y candados.
-- ---------------------------------------------------------------------------
alter table public.resultado_consulta
  add column huella text,
  add column revisado_por uuid references auth.users (id) on delete set null,
  add column revisado_en timestamptz,
  add column motivo text check (motivo is null or length(motivo) <= 500);
update public.resultado_consulta set huella = id::text where huella is null;
alter table public.resultado_consulta
  alter column huella set not null,
  add constraint resultado_consulta_huella_check check (length(huella) between 1 and 200);
create unique index resultado_consulta_huella_idx
  on public.resultado_consulta (encargo_id, entidad_id, fuente_id, huella);
create index resultado_consulta_revisado_por_idx on public.resultado_consulta (revisado_por);

-- Los resultados solo los escribe el procesador.
drop policy resultado_consulta_insert on public.resultado_consulta;
revoke insert on public.resultado_consulta from authenticated;

-- Security invoker a propósito: `current_user` debe ser el rol de quien actualiza.
create function privado.resultado_consulta_candados()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- El procesador (service_role) actualiza datos y hora de consulta; no decide.
  if current_user <> 'authenticated' then
    return new;
  end if;
  if new.organizacion_id is distinct from old.organizacion_id or new.encargo_id is distinct from old.encargo_id
     or new.entidad_id is distinct from old.entidad_id or new.fuente_id is distinct from old.fuente_id
     or new.huella is distinct from old.huella or new.coincidencia is distinct from old.coincidencia
     or new.datos is distinct from old.datos or new.consultado_en is distinct from old.consultado_en then
    raise exception 'resultado_fijo: lo que encontró la fuente no se edita' using errcode = '23514';
  end if;
  if new.estado is distinct from old.estado then
    if old.estado <> 'pendiente' or new.estado not in ('confirmada', 'descartada') then
      raise exception 'ya_revisado: el resultado ya se confirmó o descartó' using errcode = '23514';
    end if;
    if new.estado = 'descartada' and length(trim(coalesce(new.motivo, ''))) < 5 then
      raise exception 'motivo: explica por qué se descarta' using errcode = '23514';
    end if;
    new.revisado_por := (select auth.uid());
    new.revisado_en := now();
  else
    new.revisado_por := old.revisado_por;
    new.revisado_en := old.revisado_en;
    new.motivo := old.motivo;
  end if;
  if new.registro_id is distinct from old.registro_id
     and (old.registro_id is not null or new.estado <> 'confirmada') then
    raise exception 'incorporacion: solo un resultado confirmado se incorpora, una vez' using errcode = '23514';
  end if;
  return new;
end;
$$;
revoke all on function privado.resultado_consulta_candados() from public, anon;
create trigger resultado_consulta_candados
  before update on public.resultado_consulta
  for each row execute function privado.resultado_consulta_candados();

create function privado.resultado_consulta_bitacora()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.estado is distinct from old.estado then
    insert into public.bitacora (organizacion_id, encargo_id, actor, accion, objeto_tipo, objeto_id, detalle)
    values (new.organizacion_id, new.encargo_id, (select auth.uid()),
            case new.estado when 'confirmada' then 'consulta.confirmada' else 'consulta.descartada' end,
            'resultado_consulta', new.id,
            jsonb_strip_nulls(jsonb_build_object('fuente_id', new.fuente_id, 'entidad_id', new.entidad_id,
                                                 'coincidencia', new.coincidencia, 'motivo', new.motivo)));
  end if;
  if new.registro_id is distinct from old.registro_id then
    insert into public.bitacora (organizacion_id, encargo_id, actor, accion, objeto_tipo, objeto_id, detalle)
    values (new.organizacion_id, new.encargo_id, (select auth.uid()), 'consulta.incorporada',
            'resultado_consulta', new.id, jsonb_build_object('registro_id', new.registro_id));
  end if;
  return new;
end;
$$;
revoke all on function privado.resultado_consulta_bitacora() from public, anon, authenticated;
create trigger resultado_consulta_bitacora
  after update on public.resultado_consulta
  for each row execute function privado.resultado_consulta_bitacora();

-- guardar_resultados_consulta (solo el procesador):
--   p = { encargo_id, entidad_id, fuente_id, resultados: [{ huella, coincidencia, datos }] }
-- Volver a consultar actualiza lo encontrado y la hora; la decisión del auditor se respeta.
create function public.guardar_resultados_consulta(p jsonb)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_n int;
begin
  select organizacion_id into v_org from public.encargo where id = (p ->> 'encargo_id')::uuid;
  if not found then
    raise exception 'encargo inexistente' using errcode = 'P0002';
  end if;
  insert into public.resultado_consulta
    (organizacion_id, encargo_id, entidad_id, fuente_id, huella, coincidencia, datos, consultado_en, creado_por)
  select v_org, (p ->> 'encargo_id')::uuid, (p ->> 'entidad_id')::uuid, (p ->> 'fuente_id')::uuid,
         left(r ->> 'huella', 200), r ->> 'coincidencia', coalesce(r -> 'datos', '{}'::jsonb), now(), null
    from jsonb_array_elements(coalesce(p -> 'resultados', '[]'::jsonb)) r
  on conflict (encargo_id, entidad_id, fuente_id, huella) do update
     set datos = excluded.datos,
         consultado_en = excluded.consultado_en,
         coincidencia = case when public.resultado_consulta.estado = 'pendiente'
                             then excluded.coincidencia else public.resultado_consulta.coincidencia end;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;
revoke all on function public.guardar_resultados_consulta(jsonb) from public, anon, authenticated;
grant execute on function public.guardar_resultados_consulta(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Encolar consultas: una entidad (a demanda) o todo el encargo (por lote).
-- ---------------------------------------------------------------------------
create function public.encolar_consulta_fuentes(p_encargo uuid, p_entidad uuid default null)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid;
  v_id uuid;
  v_payload jsonb;
begin
  select organizacion_id into v_org from public.encargo where id = p_encargo;
  if not found then
    raise exception 'encargo inexistente' using errcode = 'P0002';
  end if;
  if p_entidad is not null and not exists (
       select 1 from public.entidad where id = p_entidad and encargo_id = p_encargo) then
    raise exception 'entidad inexistente' using errcode = 'P0002';
  end if;
  v_payload := jsonb_strip_nulls(jsonb_build_object('encargo_id', p_encargo, 'entidad_id', p_entidad));
  -- Si ya hay una igual esperando, no se duplica.
  select id into v_id from public.trabajo
   where encargo_id = p_encargo and tipo = 'consulta_fuentes' and estado in ('pendiente', 'en_proceso')
     and payload = v_payload
   limit 1;
  if v_id is not null then
    return v_id;
  end if;
  insert into public.trabajo (organizacion_id, encargo_id, tipo, payload)
  values (v_org, p_encargo, 'consulta_fuentes', v_payload)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.encolar_consulta_fuentes(uuid, uuid) from public, anon;
grant execute on function public.encolar_consulta_fuentes(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Incorporar un resultado confirmado de una fuente externa como registro (captura con la fuente
-- como origen declarado). Security invoker: RLS decide (admin y auditor).
-- ---------------------------------------------------------------------------
create function public.incorporar_resultado_consulta(p_resultado uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.resultado_consulta;
  f public.fuente_consulta;
  e public.entidad;
  v_tipo uuid;
  v_reg uuid;
  v_resumen text;
begin
  select * into r from public.resultado_consulta where id = p_resultado for update;
  if not found then
    raise exception 'resultado inexistente' using errcode = 'P0002';
  end if;
  if r.estado <> 'confirmada' or r.registro_id is not null then
    raise exception 'incorporacion: solo un resultado confirmado se incorpora, una vez' using errcode = '22023';
  end if;
  select * into f from public.fuente_consulta where id = r.fuente_id;
  if f.tipo <> 'externa' then
    raise exception 'incorporacion: solo se incorporan resultados de fuentes externas' using errcode = '22023';
  end if;
  select * into e from public.entidad where id = r.entidad_id;
  select id into v_tipo from public.tipo_documento
   where organizacion_id = r.organizacion_id
   order by (clave = 'otro') desc, nombre limit 1;
  if v_tipo is null then
    raise exception 'sin_catalogo: la organización no tiene tipos de documento' using errcode = '22023';
  end if;
  v_resumen := left(f.nombre || ': ' || coalesce(r.datos ->> 'resumen', e.nombre), 255);
  v_reg := public.capturar_registro(jsonb_build_object(
    'encargo_id', r.encargo_id, 'tipo_documento_id', v_tipo,
    'fuente', f.nombre || ' (consultada el ' || to_char(r.consultado_en at time zone 'America/Mexico_City', 'DD/MM/YYYY HH24:MI') || ')',
    'fecha_documento', (r.consultado_en at time zone 'America/Mexico_City')::date::text,
    'resumen', v_resumen,
    'campos', jsonb_build_array(jsonb_build_object(
      'campo', 'resultado_' || f.conector, 'valor_crudo', coalesce(r.datos ->> 'resumen', ''),
      'valor_normalizado', r.datos)),
    'involucrados', case when e.tipo in ('persona_moral', 'persona_fisica', 'dependencia') then
      jsonb_build_array(jsonb_build_object(
        'tipo', e.tipo, 'nombre', e.nombre, 'nombre_normalizado', e.nombre_normalizado, 'rol', 'titular',
        'identificadores', e.identificadores)) else '[]'::jsonb end,
    'evento', null));
  update public.resultado_consulta set registro_id = v_reg where id = r.id;
  return v_reg;
end;
$$;
revoke all on function public.incorporar_resultado_consulta(uuid) from public, anon;
grant execute on function public.incorporar_resultado_consulta(uuid) to authenticated;
