-- Tarea 01 · Migración 5: red generada y calificación.
-- docs/ESPECIFICACION.md §2 (Red y calificación) y §9.

-- Reglas de calificación versionadas, por organización (solo admin).
create table public.regla_calificacion (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizacion (id),
  version int not null check (version > 0),
  criterio text not null check (length(trim(criterio)) > 0),
  peso numeric(8, 2) not null,
  parametros jsonb not null default '{}'::jsonb check (jsonb_typeof(parametros) = 'object'),
  activa boolean not null default true,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  unique (organizacion_id, version, criterio)
);
create index regla_calificacion_creado_por_idx on public.regla_calificacion (creado_por);
select privado.aplicar_rls('public.regla_calificacion', '{admin}', true, false);

-- Cada generación es una fotografía: no se edita ni se borra; regenerar crea otra.
create table public.red_generada (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,
  encargo_id uuid not null,
  semillas uuid[] not null check (cardinality(semillas) > 0),
  alcance smallint not null check (alcance in (1, 2)),
  version_reglas int not null,
  generada_en timestamptz not null default now(),
  generada_por uuid references auth.users (id) on delete set null default auth.uid(),
  resumen jsonb not null default '{}'::jsonb,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (organizacion_id, encargo_id) references public.encargo (organizacion_id, id),
  unique (encargo_id, id)
);
create index red_generada_organizacion_encargo_idx on public.red_generada (organizacion_id, encargo_id, generada_en desc);
create index red_generada_generada_por_idx on public.red_generada (generada_por);
create index red_generada_creado_por_idx on public.red_generada (creado_por);
select privado.aplicar_rls('public.red_generada', '{admin,auditor}', false, false);

create table public.red_nodo (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,
  encargo_id uuid not null,
  red_id uuid not null,
  entidad_id uuid not null,
  distancia smallint not null check (distancia >= 0),
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (organizacion_id, encargo_id) references public.encargo (organizacion_id, id),
  foreign key (encargo_id, red_id) references public.red_generada (encargo_id, id),
  foreign key (encargo_id, entidad_id) references public.entidad (encargo_id, id),
  unique (red_id, entidad_id)
);
create index red_nodo_organizacion_encargo_idx on public.red_nodo (organizacion_id, encargo_id);
create index red_nodo_red_idx on public.red_nodo (encargo_id, red_id);
create index red_nodo_entidad_idx on public.red_nodo (encargo_id, entidad_id);
create index red_nodo_creado_por_idx on public.red_nodo (creado_por);
select privado.aplicar_rls('public.red_nodo', '{admin,auditor}', false, false);

create table public.red_vinculo (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,
  encargo_id uuid not null,
  red_id uuid not null,
  vinculo_id uuid not null,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (organizacion_id, encargo_id) references public.encargo (organizacion_id, id),
  foreign key (encargo_id, red_id) references public.red_generada (encargo_id, id),
  foreign key (encargo_id, vinculo_id) references public.vinculo (encargo_id, id),
  unique (red_id, vinculo_id)
);
create index red_vinculo_organizacion_encargo_idx on public.red_vinculo (organizacion_id, encargo_id);
create index red_vinculo_red_idx on public.red_vinculo (encargo_id, red_id);
create index red_vinculo_vinculo_idx on public.red_vinculo (encargo_id, vinculo_id);
create index red_vinculo_creado_por_idx on public.red_vinculo (creado_por);
select privado.aplicar_rls('public.red_vinculo', '{admin,auditor}', false, false);

-- Calificación de una entidad o vínculo dentro de una generación.
-- Solo el ajuste manual cambia después de creada; queda en bitácora.
create table public.calificacion (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,
  encargo_id uuid not null,
  red_id uuid not null,
  objeto_tipo text not null check (objeto_tipo in ('entidad', 'vinculo')),
  objeto_id uuid not null,
  puntaje numeric(5, 2) not null check (puntaje between 0 and 100),
  nivel text not null check (nivel in ('critico', 'alto', 'medio', 'bajo')),
  criterios jsonb not null default '[]'::jsonb check (jsonb_typeof(criterios) = 'array'),
  ajuste_nivel text check (ajuste_nivel in ('critico', 'alto', 'medio', 'bajo')),
  ajuste_motivo text,
  ajustado_por uuid references auth.users (id) on delete set null,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (organizacion_id, encargo_id) references public.encargo (organizacion_id, id),
  foreign key (encargo_id, red_id) references public.red_generada (encargo_id, id),
  unique (red_id, objeto_tipo, objeto_id),
  -- §9: el ajuste manual exige motivo.
  check (ajuste_nivel is null or length(trim(coalesce(ajuste_motivo, ''))) > 0)
);
create index calificacion_organizacion_encargo_idx on public.calificacion (organizacion_id, encargo_id);
create index calificacion_red_idx on public.calificacion (encargo_id, red_id);
create index calificacion_objeto_idx on public.calificacion (objeto_tipo, objeto_id);
create index calificacion_ajustado_por_idx on public.calificacion (ajustado_por);
create index calificacion_creado_por_idx on public.calificacion (creado_por);
select privado.aplicar_rls('public.calificacion', '{admin,auditor}', true, false);

create trigger calificacion_bitacora_ajuste
  after update on public.calificacion
  for each row
  when (old.ajuste_nivel is distinct from new.ajuste_nivel
        or old.ajuste_motivo is distinct from new.ajuste_motivo)
  execute function privado.escribir_bitacora(
    'calificacion.ajuste', 'ajuste_nivel', 'ajuste_motivo', 'ajustado_por');
