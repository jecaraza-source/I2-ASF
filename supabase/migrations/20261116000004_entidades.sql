-- Tarea 01 · Migración 4: entidades, vínculos, eventos y evidencia.
-- docs/ESPECIFICACION.md §2 (Entidades, vínculos y eventos).
-- Nada de esto se borra: la trazabilidad (regla 1) exige conservar el historial.

-- ---------------------------------------------------------------------------
-- entidad
-- ---------------------------------------------------------------------------
create table public.entidad (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,
  encargo_id uuid not null,
  tipo text not null check (tipo in (
    'persona_fisica', 'persona_moral', 'cuenta', 'domicilio', 'telefono', 'dependencia', 'otro')),
  nombre text not null check (length(trim(nombre)) > 0),
  nombre_normalizado text not null check (length(nombre_normalizado) > 0),
  identificadores jsonb not null default '{}'::jsonb check (jsonb_typeof(identificadores) = 'object'),
  atributos jsonb not null default '{}'::jsonb check (jsonb_typeof(atributos) = 'object'),
  riesgo_declarado text,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (organizacion_id, encargo_id) references public.encargo (organizacion_id, id),
  unique (encargo_id, id)
);
create index entidad_organizacion_encargo_idx on public.entidad (organizacion_id, encargo_id);
create index entidad_nombre_normalizado_idx on public.entidad (encargo_id, nombre_normalizado);
create index entidad_nombre_normalizado_org_idx on public.entidad (organizacion_id, nombre_normalizado);
create index entidad_identificadores_idx on public.entidad using gin (identificadores jsonb_path_ops);
create index entidad_rfc_idx on public.entidad (organizacion_id, (identificadores ->> 'rfc'))
  where identificadores ? 'rfc';
create index entidad_curp_idx on public.entidad (organizacion_id, (identificadores ->> 'curp'))
  where identificadores ? 'curp';
create index entidad_creado_por_idx on public.entidad (creado_por);
select privado.aplicar_rls('public.entidad', '{admin,auditor}', true, false);

create table public.alias_entidad (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,
  encargo_id uuid not null,
  entidad_id uuid not null,
  alias text not null check (length(trim(alias)) > 0),
  extraccion_id uuid,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (organizacion_id, encargo_id) references public.encargo (organizacion_id, id),
  foreign key (encargo_id, entidad_id) references public.entidad (encargo_id, id),
  foreign key (encargo_id, extraccion_id) references public.extraccion (encargo_id, id),
  unique (entidad_id, alias)
);
create index alias_entidad_organizacion_encargo_idx on public.alias_entidad (organizacion_id, encargo_id);
create index alias_entidad_entidad_idx on public.alias_entidad (encargo_id, entidad_id);
create index alias_entidad_extraccion_idx on public.alias_entidad (encargo_id, extraccion_id);
create index alias_entidad_creado_por_idx on public.alias_entidad (creado_por);
select privado.aplicar_rls('public.alias_entidad', '{admin,auditor}', true, false);

create table public.fusion_propuesta (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,
  encargo_id uuid not null,
  entidad_a uuid not null,
  entidad_b uuid not null,
  motivo text not null,
  estado text not null default 'propuesta' check (estado in ('propuesta', 'aceptada', 'rechazada')),
  resuelta_por uuid references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (organizacion_id, encargo_id) references public.encargo (organizacion_id, id),
  foreign key (encargo_id, entidad_a) references public.entidad (encargo_id, id),
  foreign key (encargo_id, entidad_b) references public.entidad (encargo_id, id),
  check (entidad_a <> entidad_b)
);
create index fusion_propuesta_organizacion_encargo_idx on public.fusion_propuesta (organizacion_id, encargo_id);
create index fusion_propuesta_entidad_a_idx on public.fusion_propuesta (encargo_id, entidad_a);
create index fusion_propuesta_entidad_b_idx on public.fusion_propuesta (encargo_id, entidad_b);
create index fusion_propuesta_estado_idx on public.fusion_propuesta (encargo_id, estado);
create index fusion_propuesta_resuelta_por_idx on public.fusion_propuesta (resuelta_por);
create index fusion_propuesta_creado_por_idx on public.fusion_propuesta (creado_por);
select privado.aplicar_rls('public.fusion_propuesta', '{admin,auditor}', true, false);

-- Involucrados de un registro.
create table public.registro_entidad (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,
  encargo_id uuid not null,
  registro_id uuid not null,
  entidad_id uuid not null,
  rol text not null,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (organizacion_id, encargo_id) references public.encargo (organizacion_id, id),
  foreign key (encargo_id, registro_id) references public.registro (encargo_id, id),
  foreign key (encargo_id, entidad_id) references public.entidad (encargo_id, id),
  unique (registro_id, entidad_id, rol)
);
create index registro_entidad_organizacion_encargo_idx on public.registro_entidad (organizacion_id, encargo_id);
create index registro_entidad_registro_idx on public.registro_entidad (encargo_id, registro_id);
create index registro_entidad_entidad_idx on public.registro_entidad (encargo_id, entidad_id);
create index registro_entidad_creado_por_idx on public.registro_entidad (creado_por);
select privado.aplicar_rls('public.registro_entidad', '{admin,auditor}', true, false);

-- ---------------------------------------------------------------------------
-- vinculo: relación declarada entre dos entidades (fuerza 1–10, §5).
-- ---------------------------------------------------------------------------
create table public.vinculo (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,
  encargo_id uuid not null,
  origen_id uuid not null,
  destino_id uuid not null,
  tipo text not null,
  fuerza smallint check (fuerza between 1 and 10),
  fuerza_original text,
  fecha_inicio date,
  dirigido boolean not null default false,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (organizacion_id, encargo_id) references public.encargo (organizacion_id, id),
  foreign key (encargo_id, origen_id) references public.entidad (encargo_id, id),
  foreign key (encargo_id, destino_id) references public.entidad (encargo_id, id),
  unique (encargo_id, id)
);
create index vinculo_organizacion_encargo_idx on public.vinculo (organizacion_id, encargo_id);
create index vinculo_origen_idx on public.vinculo (encargo_id, origen_id);
create index vinculo_destino_idx on public.vinculo (encargo_id, destino_id);
create index vinculo_creado_por_idx on public.vinculo (creado_por);
select privado.aplicar_rls('public.vinculo', '{admin,auditor}', true, false);

-- ---------------------------------------------------------------------------
-- evento: contrato, transferencia, llamada, pago… (monto con signo y moneda).
-- ---------------------------------------------------------------------------
create table public.evento (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,
  encargo_id uuid not null,
  tipo text not null check (tipo in ('contrato', 'transferencia', 'llamada', 'pago', 'otro')),
  fecha_hora timestamptz,
  monto numeric(18, 2),
  moneda char(3) check (moneda ~ '^[A-Z]{3}$'),
  atributos jsonb not null default '{}'::jsonb check (jsonb_typeof(atributos) = 'object'),
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (organizacion_id, encargo_id) references public.encargo (organizacion_id, id),
  unique (encargo_id, id),
  check (monto is null or moneda is not null)
);
create index evento_organizacion_encargo_idx on public.evento (organizacion_id, encargo_id);
create index evento_tipo_fecha_idx on public.evento (encargo_id, tipo, fecha_hora);
create index evento_creado_por_idx on public.evento (creado_por);
select privado.aplicar_rls('public.evento', '{admin,auditor}', true, false);

create table public.evento_participante (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,
  encargo_id uuid not null,
  evento_id uuid not null,
  entidad_id uuid not null,
  rol text not null check (rol in ('origen', 'destino', 'parte')),
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (organizacion_id, encargo_id) references public.encargo (organizacion_id, id),
  foreign key (encargo_id, evento_id) references public.evento (encargo_id, id),
  foreign key (encargo_id, entidad_id) references public.entidad (encargo_id, id),
  unique (evento_id, entidad_id, rol)
);
create index evento_participante_organizacion_encargo_idx on public.evento_participante (organizacion_id, encargo_id);
create index evento_participante_evento_idx on public.evento_participante (encargo_id, evento_id);
create index evento_participante_entidad_idx on public.evento_participante (encargo_id, entidad_id);
create index evento_participante_creado_por_idx on public.evento_participante (creado_por);
select privado.aplicar_rls('public.evento_participante', '{admin,auditor}', true, false);

-- ---------------------------------------------------------------------------
-- evidencia: liga cualquier objeto derivado con el registro (y la extracción)
-- que lo sustenta. Es la columna vertebral de la regla 1. Inmutable.
-- ---------------------------------------------------------------------------
create table public.evidencia (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,
  encargo_id uuid not null,
  objeto_tipo text not null check (objeto_tipo in ('entidad', 'vinculo', 'evento', 'alerta')),
  objeto_id uuid not null,
  registro_id uuid not null,
  extraccion_id uuid,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (organizacion_id, encargo_id) references public.encargo (organizacion_id, id),
  foreign key (encargo_id, registro_id) references public.registro (encargo_id, id),
  foreign key (encargo_id, extraccion_id) references public.extraccion (encargo_id, id)
);
create index evidencia_organizacion_encargo_idx on public.evidencia (organizacion_id, encargo_id);
create index evidencia_objeto_idx on public.evidencia (objeto_tipo, objeto_id);
create index evidencia_registro_idx on public.evidencia (encargo_id, registro_id);
create index evidencia_extraccion_idx on public.evidencia (encargo_id, extraccion_id);
create index evidencia_creado_por_idx on public.evidencia (creado_por);
select privado.aplicar_rls('public.evidencia', '{admin,auditor}', false, false);
