-- Tarea 01 · Migración 3: documentos de origen, registros y extracciones.
-- docs/ESPECIFICACION.md §2 (Expediente y registros), §4 y §6.

-- ---------------------------------------------------------------------------
-- documento_origen: original inmutable identificado por su SHA-256.
-- ---------------------------------------------------------------------------
create table public.documento_origen (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,
  encargo_id uuid not null,
  expediente_id uuid,
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  storage_path text not null,
  nombre_archivo text not null,
  mime text,
  tamano bigint check (tamano >= 0),
  folio text,
  fuente text,
  recibido_por uuid references auth.users (id) on delete set null default auth.uid(),
  recibido_en timestamptz not null default now(),
  original_id uuid,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (organizacion_id, encargo_id) references public.encargo (organizacion_id, id),
  foreign key (encargo_id, expediente_id) references public.expediente (encargo_id, id),
  foreign key (encargo_id, original_id) references public.documento_origen (encargo_id, id),
  unique (encargo_id, sha256),
  unique (encargo_id, id),
  -- §4: ruta {organizacion}/{encargo}/{sha256}
  check (storage_path = organizacion_id::text || '/' || encargo_id::text || '/' || sha256)
);
create index documento_origen_organizacion_encargo_idx on public.documento_origen (organizacion_id, encargo_id);
create index documento_origen_expediente_idx on public.documento_origen (encargo_id, expediente_id);
create index documento_origen_original_idx on public.documento_origen (encargo_id, original_id);
create index documento_origen_sha256_idx on public.documento_origen (sha256);
create index documento_origen_recibido_por_idx on public.documento_origen (recibido_por);
create index documento_origen_creado_por_idx on public.documento_origen (creado_por);
-- Sin UPDATE ni DELETE para usuarios (regla 2: originales inmutables).
select privado.aplicar_rls('public.documento_origen', '{admin,auditor}', false, false);

-- Ni siquiera el servidor puede reescribir la identidad de un original.
create function privado.documento_origen_identidad_fija()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.sha256 is distinct from old.sha256
     or new.storage_path is distinct from old.storage_path
     or new.organizacion_id is distinct from old.organizacion_id
     or new.encargo_id is distinct from old.encargo_id then
    raise exception 'documento_origen: sha256, ruta, organización y encargo son inmutables'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger documento_origen_identidad
  before update on public.documento_origen
  for each row execute function privado.documento_origen_identidad_fija();

create trigger documento_origen_bitacora_alta
  after insert on public.documento_origen
  for each row execute function privado.escribir_bitacora(
    'documento_origen.alta', 'expediente_id', 'original_id', 'mime', 'tamano');

-- ---------------------------------------------------------------------------
-- registro: unidad trazable, venga de documento, captura o importación.
-- ---------------------------------------------------------------------------
create table public.registro (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,
  encargo_id uuid not null,
  expediente_id uuid,
  tipo_documento_id uuid,
  origen text not null check (origen in ('documento', 'captura', 'importacion')),
  documento_id uuid,
  fuente text,
  fecha_documento date,
  estado_validacion text not null default 'pendiente'
    check (estado_validacion in ('pendiente', 'validado', 'corregido', 'rechazado')),
  resumen text,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (organizacion_id, encargo_id) references public.encargo (organizacion_id, id),
  foreign key (encargo_id, expediente_id) references public.expediente (encargo_id, id),
  foreign key (encargo_id, documento_id) references public.documento_origen (encargo_id, id),
  foreign key (organizacion_id, tipo_documento_id) references public.tipo_documento (organizacion_id, id),
  unique (encargo_id, id),
  -- Regla 1: un registro de documento apunta a su documento; una captura declara su fuente.
  check (origen <> 'documento' or documento_id is not null),
  check (origen <> 'captura' or length(trim(coalesce(fuente, ''))) > 0)
);
create index registro_organizacion_encargo_idx on public.registro (organizacion_id, encargo_id);
create index registro_expediente_idx on public.registro (encargo_id, expediente_id);
create index registro_documento_idx on public.registro (encargo_id, documento_id);
create index registro_tipo_documento_idx on public.registro (organizacion_id, tipo_documento_id);
create index registro_estado_idx on public.registro (encargo_id, estado_validacion);
create index registro_creado_por_idx on public.registro (creado_por);
-- Sin DELETE: un registro erróneo se marca rechazado.
select privado.aplicar_rls('public.registro', '{admin,auditor}', true, false);

create trigger registro_bitacora_alta
  after insert on public.registro
  for each row execute function privado.escribir_bitacora(
    'registro.alta', 'origen', 'estado_validacion', 'documento_id', 'expediente_id');
create trigger registro_bitacora_cambio
  after update on public.registro
  for each row execute function privado.escribir_bitacora(
    'registro.cambio', 'estado_validacion', 'documento_id', 'expediente_id', 'tipo_documento_id', 'fecha_documento');

-- ---------------------------------------------------------------------------
-- extraccion: un campo de un registro, con su ubicación exacta en el origen.
-- ---------------------------------------------------------------------------
create table public.extraccion (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,
  encargo_id uuid not null,
  registro_id uuid not null,
  campo text not null check (length(trim(campo)) > 0),
  valor_crudo text,
  valor_normalizado jsonb,
  confianza numeric(4, 3) check (confianza between 0 and 1),
  ubicacion jsonb not null default '{}'::jsonb check (jsonb_typeof(ubicacion) = 'object'),
  metodo text not null check (metodo in ('ia', 'manual', 'importacion')),
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'validado', 'corregido', 'rechazado')),
  validado_por uuid references auth.users (id) on delete set null,
  validado_en timestamptz,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (organizacion_id, encargo_id) references public.encargo (organizacion_id, id),
  foreign key (encargo_id, registro_id) references public.registro (encargo_id, id),
  unique (encargo_id, id),
  -- §6: la captura manual no tiene confianza.
  check (metodo <> 'manual' or confianza is null)
);
create index extraccion_organizacion_encargo_idx on public.extraccion (organizacion_id, encargo_id);
create index extraccion_registro_idx on public.extraccion (encargo_id, registro_id);
create index extraccion_estado_idx on public.extraccion (encargo_id, estado);
create index extraccion_validado_por_idx on public.extraccion (validado_por);
create index extraccion_creado_por_idx on public.extraccion (creado_por);
select privado.aplicar_rls('public.extraccion', '{admin,auditor}', true, false);

create trigger extraccion_bitacora_validacion
  after update on public.extraccion
  for each row
  when (old.estado is distinct from new.estado)
  execute function privado.escribir_bitacora('extraccion.validacion', 'estado', 'validado_por');
