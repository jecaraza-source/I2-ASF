-- Administrador de uso de IA: consumo por llamada, topes por organización, interruptor general
-- y proveedores permitidos por encargo (regla 7: ningún dato sale a un servicio externo que no
-- esté configurado para el encargo).

-- ---------------------------------------------------------------------------
-- Proveedores permitidos por encargo. Vacío = la IA está apagada en el encargo (valor inicial).
-- ---------------------------------------------------------------------------
alter table public.encargo
  add column ia_proveedores text[] not null default '{}'
    check (ia_proveedores <@ array['anthropic', 'openai']::text[]);

comment on column public.encargo.ia_proveedores is
  'Proveedores de IA a los que este encargo permite enviar documentos. Vacío: ninguno.';

-- Solo un administrador cambia los proveedores (auditor puede editar el resto del encargo).
create function privado.encargo_ia_solo_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.ia_proveedores is distinct from old.ia_proveedores then
    if (select auth.uid()) is not null and not public.es_miembro(new.organizacion_id, '{admin}') then
      raise exception 'solo un administrador configura la IA del encargo' using errcode = '42501';
    end if;
    insert into public.bitacora (organizacion_id, encargo_id, actor, accion, objeto_tipo, objeto_id, detalle)
    values (new.organizacion_id, new.id, (select auth.uid()), 'encargo.ia', 'encargo', new.id,
            jsonb_build_object('antes', to_jsonb(old.ia_proveedores), 'despues', to_jsonb(new.ia_proveedores)));
  end if;
  return new;
end;
$$;
create trigger encargo_ia_solo_admin
  before update on public.encargo
  for each row execute function privado.encargo_ia_solo_admin();

create function privado.encargo_ia_inicial()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Un encargo nace con la IA apagada, venga lo que venga en el insert de un usuario.
  if (select auth.uid()) is not null then
    new.ia_proveedores := '{}';
  end if;
  return new;
end;
$$;
create trigger encargo_ia_inicial
  before insert on public.encargo
  for each row execute function privado.encargo_ia_inicial();

-- ---------------------------------------------------------------------------
-- configuracion_ia: interruptor general y topes de tokens por organización.
-- ---------------------------------------------------------------------------
create table public.configuracion_ia (
  organizacion_id uuid primary key references public.organizacion (id),
  activa boolean not null default true,
  tope_diario_tokens bigint not null default 2000000 check (tope_diario_tokens >= 0),
  tope_mensual_tokens bigint not null default 30000000 check (tope_mensual_tokens >= 0),
  actualizado_en timestamptz not null default now(),
  actualizado_por uuid references auth.users (id) on delete set null default auth.uid(),
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid()
);
create index configuracion_ia_actualizado_por_idx on public.configuracion_ia (actualizado_por);
create index configuracion_ia_creado_por_idx on public.configuracion_ia (creado_por);
select privado.aplicar_rls('public.configuracion_ia', '{admin}', true, false);

-- ---------------------------------------------------------------------------
-- precio_ia: precios que captura el administrador para estimar el costo (USD por millón).
-- ---------------------------------------------------------------------------
create table public.precio_ia (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizacion (id),
  proveedor text not null check (proveedor in ('anthropic', 'openai')),
  modelo text not null check (modelo ~ '^[A-Za-z0-9._:-]{1,80}$'),
  usd_millon_entrada numeric(10, 4) not null check (usd_millon_entrada >= 0),
  usd_millon_salida numeric(10, 4) not null check (usd_millon_salida >= 0),
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  unique (organizacion_id, proveedor, modelo)
);
create index precio_ia_creado_por_idx on public.precio_ia (creado_por);
select privado.aplicar_rls('public.precio_ia', '{admin}', true, true);

-- ---------------------------------------------------------------------------
-- uso_ia: una fila por llamada a un proveedor. Nunca contenido: solo IDs, tokens y resultado.
-- Append-only: la escribe el procesador (service_role); los administradores la leen.
-- ---------------------------------------------------------------------------
create table public.uso_ia (
  id uuid primary key default gen_random_uuid(),
  organizacion_id uuid not null references public.organizacion (id),
  encargo_id uuid,
  proveedor text not null check (proveedor in ('anthropic', 'openai')),
  modelo text not null check (modelo ~ '^[A-Za-z0-9._:-]{1,80}$'),
  funcion text not null check (funcion ~ '^[a-z0-9_.-]{1,60}$'),
  tokens_entrada bigint not null default 0 check (tokens_entrada >= 0),
  tokens_salida bigint not null default 0 check (tokens_salida >= 0),
  resultado text not null check (resultado in ('ok', 'error', 'bloqueada')),
  codigo_error text check (codigo_error is null or length(codigo_error) <= 80),
  duracion_ms int check (duracion_ms is null or duracion_ms >= 0),
  trabajo_id uuid,
  registro_id uuid,
  creado_en timestamptz not null default now(),
  foreign key (organizacion_id, encargo_id) references public.encargo (organizacion_id, id)
);
create index uso_ia_organizacion_fecha_idx on public.uso_ia (organizacion_id, creado_en desc);
create index uso_ia_encargo_idx on public.uso_ia (organizacion_id, encargo_id);

alter table public.uso_ia enable row level security;
revoke all on public.uso_ia from anon, authenticated;
grant select on public.uso_ia to authenticated;
revoke update, delete, truncate on public.uso_ia from service_role;
create policy uso_ia_select on public.uso_ia
  for select to authenticated using ((select public.es_miembro(organizacion_id, '{admin}')));

-- ---------------------------------------------------------------------------
-- Consumo del día y del mes (hora de México).
-- ---------------------------------------------------------------------------
create function privado.consumo_ia(p_organizacion uuid)
returns table (hoy bigint, mes bigint)
language sql
stable
set search_path = ''
as $$
  select
    coalesce(sum(tokens_entrada + tokens_salida) filter (
      where creado_en >= date_trunc('day', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City'), 0)::bigint,
    coalesce(sum(tokens_entrada + tokens_salida), 0)::bigint
  from public.uso_ia
  where organizacion_id = p_organizacion
    and creado_en >= date_trunc('month', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City';
$$;
revoke all on function privado.consumo_ia(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- ia_permitida: lo consulta el procesador ANTES de cada llamada a un proveedor.
-- Devuelve { permitida, motivo, organizacion_id }.
-- ---------------------------------------------------------------------------
create function public.ia_permitida(p_encargo uuid, p_proveedor text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  e public.encargo;
  c public.configuracion_ia;
  v_hoy bigint;
  v_mes bigint;
  v_motivo text;
begin
  select * into e from public.encargo where id = p_encargo;
  if not found then
    return jsonb_build_object('permitida', false, 'motivo', 'encargo_inexistente');
  end if;
  select * into c from public.configuracion_ia where organizacion_id = e.organizacion_id;
  select k.hoy, k.mes into v_hoy, v_mes from privado.consumo_ia(e.organizacion_id) k;

  if found and c.organizacion_id is not null and not c.activa then
    v_motivo := 'ia_apagada_organizacion';
  elsif not (p_proveedor = any (e.ia_proveedores)) then
    v_motivo := 'proveedor_no_permitido_en_encargo';
  elsif v_hoy >= coalesce(c.tope_diario_tokens, 2000000) then
    v_motivo := 'tope_diario';
  elsif v_mes >= coalesce(c.tope_mensual_tokens, 30000000) then
    v_motivo := 'tope_mensual';
  end if;
  return jsonb_build_object('permitida', v_motivo is null, 'motivo', v_motivo,
                            'organizacion_id', e.organizacion_id);
end;
$$;
revoke all on function public.ia_permitida(uuid, text) from public, anon, authenticated;
grant execute on function public.ia_permitida(uuid, text) to service_role;
grant execute on function privado.consumo_ia(uuid) to service_role;

-- registrar_uso_ia: una fila por llamada (también las bloqueadas y las fallidas).
create function public.registrar_uso_ia(p jsonb)
returns uuid
language sql
security invoker
set search_path = ''
as $$
  insert into public.uso_ia
    (organizacion_id, encargo_id, proveedor, modelo, funcion, tokens_entrada, tokens_salida, resultado,
     codigo_error, duracion_ms, trabajo_id, registro_id)
  values
    ((p ->> 'organizacion_id')::uuid, nullif(p ->> 'encargo_id', '')::uuid, p ->> 'proveedor',
     p ->> 'modelo', p ->> 'funcion', greatest(0, coalesce((p ->> 'tokens_entrada')::bigint, 0)),
     greatest(0, coalesce((p ->> 'tokens_salida')::bigint, 0)), p ->> 'resultado',
     left(nullif(p ->> 'codigo_error', ''), 80), nullif(p ->> 'duracion_ms', '')::int,
     nullif(p ->> 'trabajo_id', '')::uuid, nullif(p ->> 'registro_id', '')::uuid)
  returning id;
$$;
revoke all on function public.registrar_uso_ia(jsonb) from public, anon, authenticated;
grant execute on function public.registrar_uso_ia(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- guardar_configuracion_ia: interruptor y topes (solo admin, por RLS). Con bitácora.
-- ---------------------------------------------------------------------------
create function public.guardar_configuracion_ia(
  p_organizacion uuid, p_activa boolean, p_tope_diario bigint, p_tope_mensual bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.configuracion_ia (organizacion_id, activa, tope_diario_tokens, tope_mensual_tokens)
  values (p_organizacion, p_activa, p_tope_diario, p_tope_mensual)
  on conflict (organizacion_id) do update
    set activa = excluded.activa, tope_diario_tokens = excluded.tope_diario_tokens,
        tope_mensual_tokens = excluded.tope_mensual_tokens, actualizado_en = now(),
        actualizado_por = (select auth.uid());
  insert into public.bitacora (organizacion_id, actor, accion, objeto_tipo, objeto_id, detalle)
  values (p_organizacion, (select auth.uid()), 'ia.configuracion', 'organizacion', p_organizacion,
          jsonb_build_object('activa', p_activa, 'tope_diario_tokens', p_tope_diario,
                             'tope_mensual_tokens', p_tope_mensual));
end;
$$;
revoke all on function public.guardar_configuracion_ia(uuid, boolean, bigint, bigint) from public, anon;
grant execute on function public.guardar_configuracion_ia(uuid, boolean, bigint, bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- resumen_uso_ia: lo que muestra el panel. Security invoker: quien no es admin no ve filas.
-- ---------------------------------------------------------------------------
create function public.resumen_uso_ia(p_organizacion uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with limites as (
    select date_trunc('day', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City' as hoy,
           date_trunc('month', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City' as mes
  ),
  u as (
    select x.*, x.tokens_entrada + x.tokens_salida as tokens,
           (x.tokens_entrada * pr.usd_millon_entrada + x.tokens_salida * pr.usd_millon_salida) / 1000000 as usd,
           (x.creado_en at time zone 'America/Mexico_City')::date as dia
      from public.uso_ia x
      left join public.precio_ia pr
        on pr.organizacion_id = x.organizacion_id and pr.proveedor = x.proveedor and pr.modelo = x.modelo
     where x.organizacion_id = p_organizacion
       and x.creado_en >= (select least(mes, now() - interval '30 days') from limites)
  ),
  del_mes as (select * from u where creado_en >= (select mes from limites))
  select jsonb_build_object(
    'hoy', (select jsonb_build_object('tokens', coalesce(sum(tokens), 0), 'llamadas', count(*), 'usd', sum(usd))
              from u where creado_en >= (select hoy from limites)),
    'mes', (select jsonb_build_object('tokens', coalesce(sum(tokens), 0), 'llamadas', count(*), 'usd', sum(usd),
                                      'errores', count(*) filter (where resultado = 'error'),
                                      'bloqueadas', count(*) filter (where resultado = 'bloqueada'))
              from del_mes),
    'por_modelo', coalesce((select jsonb_agg(f order by (f ->> 'tokens')::bigint desc) from (
        select jsonb_build_object('proveedor', proveedor, 'modelo', modelo, 'llamadas', count(*),
                 'tokens_entrada', sum(tokens_entrada), 'tokens_salida', sum(tokens_salida),
                 'tokens', sum(tokens), 'usd', sum(usd)) as f
          from del_mes group by proveedor, modelo) m), '[]'::jsonb),
    'por_encargo', coalesce((select jsonb_agg(f order by (f ->> 'tokens')::bigint desc) from (
        select jsonb_build_object('encargo_id', d.encargo_id, 'nombre', e.nombre, 'llamadas', count(*),
                 'tokens', sum(d.tokens), 'usd', sum(d.usd)) as f
          from del_mes d left join public.encargo e on e.id = d.encargo_id
         group by d.encargo_id, e.nombre) m), '[]'::jsonb),
    'por_funcion', coalesce((select jsonb_agg(f order by (f ->> 'tokens')::bigint desc) from (
        select jsonb_build_object('funcion', funcion, 'llamadas', count(*), 'tokens', sum(tokens), 'usd', sum(usd)) as f
          from del_mes group by funcion) m), '[]'::jsonb),
    'por_dia', coalesce((select jsonb_agg(f order by f ->> 'dia') from (
        select jsonb_build_object('dia', dia, 'tokens', sum(tokens), 'llamadas', count(*)) as f
          from u where creado_en >= now() - interval '30 days' group by dia) m), '[]'::jsonb),
    'recientes', coalesce((select jsonb_agg(f) from (
        select jsonb_build_object('id', id, 'creado_en', creado_en, 'proveedor', proveedor, 'modelo', modelo,
                 'funcion', funcion, 'resultado', resultado, 'codigo_error', codigo_error,
                 'tokens', tokens, 'encargo_id', encargo_id) as f
          from u where resultado <> 'ok' order by creado_en desc limit 15) m), '[]'::jsonb)
  );
$$;
revoke all on function public.resumen_uso_ia(uuid) from public, anon;
grant execute on function public.resumen_uso_ia(uuid) to authenticated;
