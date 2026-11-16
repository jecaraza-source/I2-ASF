-- Tarea 01 · Migración 2: encargos, expedientes y catálogo documental.
-- docs/ESPECIFICACION.md §2 (Organización y acceso, Expediente y registros) y §6.

-- ---------------------------------------------------------------------------
-- encargo
-- ---------------------------------------------------------------------------
create table public.encargo (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizacion (id),
  nombre text not null check (length(trim(nombre)) > 0),
  tipo_auditoria text,
  umbral_confianza numeric(3, 2) not null default 0.85
    check (umbral_confianza between 0 and 1),
  periodo_inicio date,
  periodo_fin date,
  estado text not null default 'activo' check (estado in ('activo', 'cerrado', 'archivado')),
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  unique (organizacion_id, id),
  check (periodo_fin is null or periodo_inicio is null or periodo_fin >= periodo_inicio)
);
create index encargo_creado_por_idx on public.encargo (creado_por);
select privado.aplicar_rls('public.encargo', '{admin,auditor}');

-- ---------------------------------------------------------------------------
-- expediente
-- ---------------------------------------------------------------------------
create table public.expediente (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,
  encargo_id uuid not null,
  numero_control text,
  identificador text not null,
  descripcion text,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (organizacion_id, encargo_id) references public.encargo (organizacion_id, id),
  unique (encargo_id, identificador),
  unique (encargo_id, id)
);
create index expediente_organizacion_encargo_idx on public.expediente (organizacion_id, encargo_id);
create index expediente_numero_control_idx on public.expediente (encargo_id, numero_control);
create index expediente_creado_por_idx on public.expediente (creado_por);
select privado.aplicar_rls('public.expediente', '{admin,auditor}');

-- Genera EXP-AAAA-NNNN cuando no se da identificador (§14: regla provisional).
-- El consecutivo es por encargo y por año; el candado evita choques concurrentes.
create function privado.generar_identificador_expediente()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  anio text := to_char(now() at time zone 'America/Mexico_City', 'YYYY');
  prefijo text := 'EXP-' || anio || '-';
  siguiente int;
begin
  if new.identificador is null or length(trim(new.identificador)) = 0 then
    perform pg_advisory_xact_lock(hashtextextended('expediente:' || new.encargo_id::text, 0));
    select coalesce(max(substring(e.identificador from length(prefijo) + 1)::int), 0) + 1
      into siguiente
      from public.expediente e
     where e.encargo_id = new.encargo_id
       and e.identificador ~ ('^' || prefijo || '[0-9]{4,}$');
    new.identificador := prefijo || lpad(siguiente::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger expediente_identificador
  before insert on public.expediente
  for each row execute function privado.generar_identificador_expediente();

-- ---------------------------------------------------------------------------
-- Catálogo documental (por organización; solo admin lo edita).
-- ---------------------------------------------------------------------------
create table public.categoria_documental (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizacion (id),
  nombre text not null check (length(trim(nombre)) > 0),
  orden int not null default 0,
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  unique (organizacion_id, nombre),
  unique (organizacion_id, id)
);
create index categoria_documental_creado_por_idx on public.categoria_documental (creado_por);
select privado.aplicar_rls('public.categoria_documental', '{admin}', true, true);

create table public.tipo_documento (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null,
  clave text not null check (clave ~ '^[a-z0-9_]+$'),
  nombre text not null check (length(trim(nombre)) > 0),
  categoria_id uuid not null,
  campos_esperados jsonb not null default '[]'::jsonb check (jsonb_typeof(campos_esperados) = 'array'),
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  foreign key (organizacion_id, categoria_id) references public.categoria_documental (organizacion_id, id),
  unique (organizacion_id, clave),
  unique (organizacion_id, id)
);
create index tipo_documento_categoria_idx on public.tipo_documento (organizacion_id, categoria_id);
create index tipo_documento_creado_por_idx on public.tipo_documento (creado_por);
select privado.aplicar_rls('public.tipo_documento', '{admin}', true, true);
