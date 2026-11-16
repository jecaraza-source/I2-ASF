-- Tarea 01 · Migración 6: alertas, hallazgos, consultas externas, plantillas y trabajos.
-- docs/ESPECIFICACION.md §2 (Alertas, consultas y operación), §10 y §11.

-- ---------------------------------------------------------------------------
-- alerta: resultado de una regla. Nunca es un hallazgo automático (regla 4).
-- ---------------------------------------------------------------------------
create table public.alerta (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,
  encargo_id uuid not null,
  regla text not null check (regla ~ '^R[0-9]{2}'),
  severidad text not null check (severidad in ('critica', 'alta', 'media', 'baja')),
  estado text not null default 'abierta' check (estado in ('abierta', 'confirmada', 'descartada')),
  detalle jsonb not null default '{}'::jsonb check (jsonb_typeof(detalle) = 'object'),
  resuelta_por uuid references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (organizacion_id, encargo_id) references public.encargo (organizacion_id, id),
  unique (encargo_id, id)
);
create index alerta_organizacion_encargo_idx on public.alerta (organizacion_id, encargo_id);
create index alerta_estado_idx on public.alerta (encargo_id, estado, severidad);
create index alerta_regla_idx on public.alerta (encargo_id, regla);
create index alerta_resuelta_por_idx on public.alerta (resuelta_por);
create index alerta_creado_por_idx on public.alerta (creado_por);
select privado.aplicar_rls('public.alerta', '{admin,auditor}', true, false);

create trigger alerta_bitacora_resolucion
  after update on public.alerta
  for each row
  when (old.estado is distinct from new.estado)
  execute function privado.escribir_bitacora('alerta.resolucion', 'estado', 'resuelta_por');

-- ---------------------------------------------------------------------------
-- hallazgo: lo redacta y firma un auditor a partir de alertas confirmadas.
-- ---------------------------------------------------------------------------
create table public.hallazgo (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,
  encargo_id uuid not null,
  redaccion text not null,
  firmado_por uuid references auth.users (id) on delete set null,
  firmado_en timestamptz,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (organizacion_id, encargo_id) references public.encargo (organizacion_id, id),
  unique (encargo_id, id),
  check ((firmado_por is null) = (firmado_en is null))
);
create index hallazgo_organizacion_encargo_idx on public.hallazgo (organizacion_id, encargo_id);
create index hallazgo_firmado_por_idx on public.hallazgo (firmado_por);
create index hallazgo_creado_por_idx on public.hallazgo (creado_por);
select privado.aplicar_rls('public.hallazgo', '{admin,auditor}', true, false);

create table public.hallazgo_alerta (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,
  encargo_id uuid not null,
  hallazgo_id uuid not null,
  alerta_id uuid not null,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (organizacion_id, encargo_id) references public.encargo (organizacion_id, id),
  foreign key (encargo_id, hallazgo_id) references public.hallazgo (encargo_id, id),
  foreign key (encargo_id, alerta_id) references public.alerta (encargo_id, id),
  unique (hallazgo_id, alerta_id)
);
create index hallazgo_alerta_organizacion_encargo_idx on public.hallazgo_alerta (organizacion_id, encargo_id);
create index hallazgo_alerta_hallazgo_idx on public.hallazgo_alerta (encargo_id, hallazgo_id);
create index hallazgo_alerta_alerta_idx on public.hallazgo_alerta (encargo_id, alerta_id);
create index hallazgo_alerta_creado_por_idx on public.hallazgo_alerta (creado_por);
select privado.aplicar_rls('public.hallazgo_alerta', '{admin,auditor}', false, false);

-- ---------------------------------------------------------------------------
-- Fuentes de consulta (por organización; solo admin) y sus resultados.
-- ---------------------------------------------------------------------------
create table public.fuente_consulta (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizacion (id),
  nombre text not null check (length(trim(nombre)) > 0),
  tipo text not null check (tipo in ('interna', 'externa')),
  conector text not null,
  config jsonb not null default '{}'::jsonb check (jsonb_typeof(config) = 'object'),
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  unique (organizacion_id, nombre),
  unique (organizacion_id, id)
);
create index fuente_consulta_creado_por_idx on public.fuente_consulta (creado_por);
select privado.aplicar_rls('public.fuente_consulta', '{admin}', true, false);

create table public.resultado_consulta (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,
  encargo_id uuid not null,
  entidad_id uuid not null,
  fuente_id uuid not null,
  coincidencia text not null check (coincidencia in ('exacta', 'propuesta')),
  datos jsonb not null default '{}'::jsonb,
  consultado_en timestamptz not null default now(),
  estado text not null default 'pendiente' check (estado in ('pendiente', 'confirmada', 'descartada')),
  registro_id uuid,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (organizacion_id, encargo_id) references public.encargo (organizacion_id, id),
  foreign key (encargo_id, entidad_id) references public.entidad (encargo_id, id),
  foreign key (organizacion_id, fuente_id) references public.fuente_consulta (organizacion_id, id),
  foreign key (encargo_id, registro_id) references public.registro (encargo_id, id)
);
create index resultado_consulta_organizacion_encargo_idx on public.resultado_consulta (organizacion_id, encargo_id);
create index resultado_consulta_entidad_idx on public.resultado_consulta (encargo_id, entidad_id);
create index resultado_consulta_fuente_idx on public.resultado_consulta (organizacion_id, fuente_id);
create index resultado_consulta_registro_idx on public.resultado_consulta (encargo_id, registro_id);
create index resultado_consulta_creado_por_idx on public.resultado_consulta (creado_por);
select privado.aplicar_rls('public.resultado_consulta', '{admin,auditor}', true, false);

-- ---------------------------------------------------------------------------
-- Plantillas de importación de Excel (§8), por organización; solo admin.
-- ---------------------------------------------------------------------------
create table public.plantilla_importacion (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizacion (id),
  nombre text not null check (length(trim(nombre)) > 0),
  firma_hojas jsonb not null check (jsonb_typeof(firma_hojas) in ('array', 'object')),
  mapeo jsonb not null check (jsonb_typeof(mapeo) in ('array', 'object')),
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  unique (organizacion_id, nombre)
);
create index plantilla_importacion_creado_por_idx on public.plantilla_importacion (creado_por);
select privado.aplicar_rls('public.plantilla_importacion', '{admin}', true, true);

-- ---------------------------------------------------------------------------
-- trabajo: cola en base (§ Stack). Los usuarios encolan; el procesador
-- (service role, tarea 07) es el único que actualiza.
-- ---------------------------------------------------------------------------
create table public.trabajo (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizacion (id),
  encargo_id uuid,
  tipo text not null check (length(trim(tipo)) > 0),
  payload jsonb not null default '{}'::jsonb,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'en_proceso', 'hecho', 'error')),
  intentos int not null default 0 check (intentos >= 0),
  error text,
  bloqueado_hasta timestamptz,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (organizacion_id, encargo_id) references public.encargo (organizacion_id, id)
);
create index trabajo_pendientes_idx on public.trabajo (estado, bloqueado_hasta, creado_en)
  where estado in ('pendiente', 'en_proceso');
create index trabajo_organizacion_encargo_idx on public.trabajo (organizacion_id, encargo_id);
create index trabajo_creado_por_idx on public.trabajo (creado_por);
select privado.aplicar_rls('public.trabajo', '{admin,auditor}', false, false);
