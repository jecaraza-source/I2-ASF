-- Tarea 13 · Endurecimiento.
--
-- 1. Funciones SECURITY DEFINER fuera del esquema expuesto: el cuerpo pasa a `privado` y en `public`
--    queda una envoltura SECURITY INVOKER con la misma firma (la app no cambia). Las políticas que
--    usan es_miembro siguen apuntando a la misma función (por OID).
-- 2. Tablas de evidencia que ninguna función ni pantalla modifica: sin UPDATE para `authenticated`.
-- 3. Entidad, extracción y propuesta de fusión: solo se modifican a través de funciones de la base
--    (validar, capturar, importar, fusionar, rechazar); un PATCH directo a la API se rechaza.
-- 4. Índices que marcó el asesor de rendimiento y permisos sobrantes.

-- ---------------------------------------------------------------------------
-- 1. SECURITY DEFINER → privado + envoltura invoker
-- ---------------------------------------------------------------------------

-- Lo que se cree en privado no queda ejecutable para PUBLIC (anon incluido); authenticated y
-- service_role lo conservan, como hasta ahora.
alter default privileges in schema privado revoke execute on functions from public;
alter default privileges in schema privado grant execute on functions to authenticated, service_role;
do $$
declare
  f record;
begin
  -- Solo las que hoy están abiertas a PUBLIC; las que ya se cerraron a propósito siguen cerradas.
  for f in
    select p.oid::regprocedure as firma
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'privado'
       and (p.proacl is null
            or exists (select 1 from aclexplode(p.proacl) a
                        where a.grantee = 0 and a.privilege_type = 'EXECUTE'))
  loop
    execute format('grant execute on function %s to authenticated, service_role', f.firma);
    execute format('revoke execute on function %s from public, anon', f.firma);
  end loop;
end;
$$;

do $$
declare
  f record;
  argumentos text;
  llamada text;
  resultado text;
  cuerpo text;
  roles text;
begin
  for f in
    select p.oid, p.proname, p.proretset, p.provolatile,
           pg_get_function_arguments(p.oid) as args,
           pg_get_function_identity_arguments(p.oid) as ident,
           pg_get_function_result(p.oid) as res,
           p.pronargs
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.prosecdef
       and p.prokind = 'f'
  loop
    -- Roles que hoy pueden ejecutarla (sin PUBLIC ni el dueño).
    select string_agg(distinct quote_ident(r.rolname), ', ')
      into roles
      from aclexplode((select proacl from pg_proc where oid = f.oid)) a
      join pg_roles r on r.oid = a.grantee
     where a.privilege_type = 'EXECUTE'
       and r.rolname in ('anon', 'authenticated', 'service_role');

    execute format('alter function public.%I(%s) set schema privado', f.proname, f.ident);
    execute format('revoke all on function privado.%I(%s) from public, anon, authenticated, service_role', f.proname, f.ident);
    if roles is not null then
      execute format('grant execute on function privado.%I(%s) to %s', f.proname, f.ident, roles);
    end if;

    select string_agg('$' || i, ', ') into llamada from generate_series(1, f.pronargs) i;
    llamada := coalesce(llamada, '');
    resultado := f.res;
    if f.proretset then
      cuerpo := format('select * from privado.%I(%s)', f.proname, llamada);
    else
      cuerpo := format('select privado.%I(%s)', f.proname, llamada);
    end if;
    argumentos := f.args;
    execute format(
      'create function public.%I(%s) returns %s language sql %s security invoker set search_path = '''' as %L',
      f.proname, argumentos, resultado,
      case f.provolatile when 's' then 'stable' when 'i' then 'immutable' else 'volatile' end,
      cuerpo);
    execute format('revoke all on function public.%I(%s) from public, anon, authenticated, service_role', f.proname, f.ident);
    if roles is not null then
      execute format('grant execute on function public.%I(%s) to %s', f.proname, f.ident, roles);
    end if;
  end loop;
end;
$$;

-- El registro de accesos fallidos se llama antes de iniciar sesión.
grant usage on schema privado to anon;

-- ---------------------------------------------------------------------------
-- 2. Evidencia que no se modifica: vínculos, eventos, participantes, menciones y alias
-- ---------------------------------------------------------------------------
drop policy vinculo_update on public.vinculo;
drop policy evento_update on public.evento;
drop policy evento_participante_update on public.evento_participante;
drop policy registro_entidad_update on public.registro_entidad;
drop policy alias_entidad_update on public.alias_entidad;
revoke update on public.vinculo, public.evento, public.evento_participante,
  public.registro_entidad, public.alias_entidad from authenticated;

-- ---------------------------------------------------------------------------
-- 3. Entidad, extracción y fusión: solo por funciones de la base
-- ---------------------------------------------------------------------------
-- PostgREST deja en request.path la ruta de la petición: /rpc/<función> cuando se llama una función
-- y /<tabla> cuando se escribe directo. Sin petición HTTP (pruebas, migraciones, service role) no
-- aplica: `authenticated` no inicia sesión directa en la base.
create function privado.solo_por_funcion()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_ruta text := coalesce(current_setting('request.path', true), '');
begin
  if current_user = 'authenticated' and v_ruta <> '' and v_ruta not like '/rpc/%' then
    raise exception '% solo se modifica a través de las funciones de la plataforma', tg_table_name
      using errcode = '42501';
  end if;
  return new;
end;
$$;

revoke all on function privado.solo_por_funcion() from public, anon;

create trigger entidad_solo_por_funcion before update on public.entidad
  for each row execute function privado.solo_por_funcion();
create trigger extraccion_solo_por_funcion before update on public.extraccion
  for each row execute function privado.solo_por_funcion();
create trigger fusion_propuesta_solo_por_funcion before update on public.fusion_propuesta
  for each row execute function privado.solo_por_funcion();

-- ---------------------------------------------------------------------------
-- 4. Políticas que escalan: la membresía se calcula una vez por consulta, no por fila
-- ---------------------------------------------------------------------------
-- `es_miembro(organizacion_id)` depende de la fila, así que Postgres la llama por cada fila que lee.
-- Con 50,000 registros y sus subconsultas, el expediente tardaba minutos. Con
-- `organizacion_id = any ((select privado.mis_organizaciones(...))::uuid[])` la lista de organizaciones del
-- usuario se calcula una sola vez (InitPlan) y la comparación por fila es trivial.
create function privado.mis_organizaciones(p_roles text[] default null)
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
     and (p_roles is null or m.rol = any (p_roles));
$$;
revoke all on function privado.mis_organizaciones(text[]) from public, anon;
grant execute on function privado.mis_organizaciones(text[]) to authenticated, service_role;

create function privado.politica_escalable(p_expr text)
returns text
language sql
immutable
set search_path = ''
as $f$
  select regexp_replace(
           p_expr,
           '\(\s*SELECT\s+(?:\w+\.)?es_miembro\(([a-z0-9_]+\.[a-z0-9_]+|[a-z0-9_]+)(?:,\s*(''\{[a-z,]*\}''::text\[\]))?\)\s+AS\s+es_miembro\)',
           '(\1 = ANY ((SELECT privado.mis_organizaciones(\2))::uuid[]))',
           'gi');
$f$;

do $$
declare
  p record;
  usar text;
  verificar text;
begin
  for p in
    select schemaname, tablename, policyname, qual, with_check
      from pg_policies
     where schemaname = 'public'
       and (qual ~ 'es_miembro\(' or with_check ~ 'es_miembro\(')
  loop
    usar := privado.politica_escalable(p.qual);
    verificar := privado.politica_escalable(p.with_check);
    if (usar is not null and usar ~ 'es_miembro\(') or (verificar is not null and verificar ~ 'es_miembro\(') then
      raise exception 'política % de % no se pudo convertir', p.policyname, p.tablename;
    end if;
    if usar is not null and verificar is not null then
      execute format('alter policy %I on %I.%I using (%s) with check (%s)',
                     p.policyname, p.schemaname, p.tablename, usar, verificar);
    elsif usar is not null then
      execute format('alter policy %I on %I.%I using (%s)', p.policyname, p.schemaname, p.tablename, usar);
    else
      execute format('alter policy %I on %I.%I with check (%s)', p.policyname, p.schemaname, p.tablename, verificar);
    end if;
  end loop;
end;
$$;

drop function privado.politica_escalable(text);

-- Las tablas nuevas nacen con la forma escalable.
create or replace function privado.aplicar_rls(
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
    'create policy %I on %s for select to authenticated using (organizacion_id = any ((select privado.mis_organizaciones())::uuid[]))',
    n || '_select', t);
  execute format(
    'create policy %I on %s for insert to authenticated with check (organizacion_id = any ((select privado.mis_organizaciones(%s))::uuid[]))',
    n || '_insert', t, r);
  if p_update then
    execute format(
      'create policy %I on %s for update to authenticated using (organizacion_id = any ((select privado.mis_organizaciones(%s))::uuid[])) with check (organizacion_id = any ((select privado.mis_organizaciones(%s))::uuid[]))',
      n || '_update', t, r, r);
  else
    execute format('revoke update on %s from authenticated', t);
  end if;
  if p_delete then
    execute format(
      'create policy %I on %s for delete to authenticated using (organizacion_id = any ((select privado.mis_organizaciones(%s))::uuid[]))',
      n || '_delete', t, r);
  else
    execute format('revoke delete, truncate on %s from authenticated', t);
  end if;
end;
$$;
revoke all on function privado.aplicar_rls(regclass, text[], boolean, boolean) from public, anon, authenticated;


-- ---------------------------------------------------------------------------
-- Expediente documental a escala (50,000 registros)
-- ---------------------------------------------------------------------------
-- Antes, la tabla y el árbol armaban involucrados, referencias, montos y nivel de TODOS los
-- registros (subconsultas sobre seis tablas, con RLS en cada una) y después paginaban: con 50,000
-- registros no terminaba. Ahora:
--   1. `privado.expediente_filas` filtra y ordena con lo mínimo; lo costoso (entidades, nivel,
--      texto buscable) solo se calcula cuando el filtro o el orden lo piden.
--   2. `expediente_registros` toma la página y solo para esas filas llama a `expediente_base`.
-- Las dos funciones privadas corren como dueño (sin RLS) después de verificar que quien consulta es
-- miembro activo de la organización del encargo; todo se filtra por ese encargo. Las funciones
-- públicas siguen siendo SECURITY INVOKER.

create function privado.expediente_filas(p jsonb)
returns table (
  registro_id uuid, expediente_id uuid, categoria_id uuid, entidades uuid[], fecha date,
  clave text, creado_en timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  with
  parametros as (
    select (p ->> 'encargo_id')::uuid as encargo,
           nullif(p ->> 'tipo_documento_id', '')::uuid as tipo,
           nullif(p ->> 'origen', '') as origen,
           nullif(p ->> 'estado', '') as estado,
           nullif(p ->> 'desde', '')::date as desde,
           nullif(p ->> 'hasta', '')::date as hasta,
           array(select t from regexp_split_to_table(privado.plano(trim(coalesce(p ->> 'q', ''))), '\s+') t
                  where length(t) > 0 limit 8) as terminos,
           coalesce(p ->> 'orden', 'fecha') as orden,
           (nullif(p ->> 'entidad_id', '') is not null
            or coalesce((p ->> '_entidades')::boolean, false)) as con_entidades
     where exists (select 1 from public.encargo e
                    where e.id = (p ->> 'encargo_id')::uuid
                      and e.organizacion_id = any (privado.mis_organizaciones()))
  ),
  ultima_red as (
    select g.id from public.red_generada g, parametros
     where g.encargo_id = parametros.encargo
     order by g.generada_en desc limit 1
  ),
  registros as (
    select r.id, r.expediente_id, r.resumen, r.fuente, r.estado_validacion, r.creado_en,
           r.fecha_documento, d.nombre_archivo, td.nombre as tipo_nombre, td.categoria_id as cat_id,
           c.nombre as cat_nombre, x.identificador as exp_identificador,
           pa.orden, pa.con_entidades, pa.terminos, pa.desde, pa.hasta
      from public.registro r
      cross join parametros pa
      left join public.documento_origen d on d.id = r.documento_id
      left join public.tipo_documento td on td.id = r.tipo_documento_id
      left join public.categoria_documental c on c.id = td.categoria_id
      left join public.expediente x on x.id = r.expediente_id
     where r.encargo_id = pa.encargo
       and (pa.tipo is null or r.tipo_documento_id = pa.tipo)
       and (pa.origen is null or r.origen = pa.origen)
       and (pa.estado is null
            or (pa.estado = 'validados' and r.estado_validacion in ('validado', 'corregido'))
            or r.estado_validacion = pa.estado)
  ),
  calculadas as (
    select r.*,
           case when r.con_entidades then
             array(select distinct coalesce(e.fusionada_en, e.id)
                     from public.registro_entidad re join public.entidad e on e.id = re.entidad_id
                    where re.registro_id = r.id)
           end as ents,
           coalesce(r.fecha_documento,
                    (select min(ev.fecha_hora)::date
                       from public.evidencia vi join public.evento ev on ev.id = vi.objeto_id
                      where vi.registro_id = r.id and vi.objeto_tipo = 'evento')) as fecha_efectiva,
           case when r.orden = 'calificacion' then
             (select min(array_position(array['critico', 'alto', 'medio', 'bajo'],
                                        coalesce(ca.ajuste_nivel, ca.nivel)))
                from public.registro_entidad re
                join public.entidad e on e.id = re.entidad_id
                join public.calificacion ca on ca.objeto_tipo = 'entidad'
                  and ca.objeto_id = coalesce(e.fusionada_en, e.id)
                  and ca.red_id = (select id from ultima_red)
               where re.registro_id = r.id)
           end as posicion_nivel
      from registros r
  )
  select c.id, c.expediente_id, c.cat_id, coalesce(c.ents, '{}'::uuid[]), c.fecha_efectiva,
         case c.orden
           when 'fecha' then to_char(c.fecha_efectiva, 'YYYY-MM-DD')
           when 'resumen' then privado.plano(c.resumen)
           when 'tipo' then privado.plano(coalesce(c.cat_nombre, '~') || ' ' || coalesce(c.tipo_nombre, ''))
           when 'estado' then c.estado_validacion
           -- Mayor clave = mayor riesgo; sin nivel queda al final en ambos sentidos.
           when 'calificacion' then (9 - c.posicion_nivel)::text
         end,
         c.creado_en
    from calculadas c
   where (c.desde is null or c.fecha_efectiva >= c.desde)
     and (c.hasta is null or c.fecha_efectiva <= c.hasta)
     and privado.expediente_en_arbol(p, c.expediente_id, coalesce(c.ents, '{}'::uuid[]), c.cat_id)
     -- Búsqueda: cada término en el resumen, el archivo, la fuente, el expediente, los nombres e
     -- identificadores de los involucrados, el número de sus eventos o algún dato validado.
     and (cardinality(c.terminos) = 0 or not exists (
       select 1 from unnest(c.terminos) t
        where position(t in privado.plano(concat_ws(' ', c.resumen, c.nombre_archivo, c.fuente,
                c.exp_identificador,
                (select string_agg(concat_ws(' ', e.nombre, e.identificadores ->> 'rfc',
                                             e.identificadores ->> 'curp'), ' ')
                   from public.registro_entidad re join public.entidad e on e.id = re.entidad_id
                  where re.registro_id = c.id),
                (select string_agg(ev.atributos ->> 'numero', ' ')
                   from public.evidencia vi join public.evento ev on ev.id = vi.objeto_id
                  where vi.registro_id = c.id and vi.objeto_tipo = 'evento')))) = 0
          and not exists (select 1 from public.extraccion x
                           where x.registro_id = c.id and x.estado in ('validado', 'corregido')
                             and position(t in privado.plano(x.valor_crudo)) > 0)));
$$;
revoke all on function privado.expediente_filas(jsonb) from public, anon;
grant execute on function privado.expediente_filas(jsonb) to authenticated;

-- expediente_base: como dueño, con la verificación de membresía y acotada a `ids` cuando se pasan
-- (la página que ya eligió expediente_filas).
do $$
declare
  v_def text := pg_get_functiondef('privado.expediente_base(jsonb)'::regprocedure);
  v_cambios text[][] := array[
    [E'                  where length(t) > 0 limit 8) as terminos\n  ),',
     E'                  where length(t) > 0 limit 8) as terminos,\n'
     || E'           case when p ? ''ids'' then\n'
     || E'             array(select jsonb_array_elements_text(p -> ''ids'')::uuid)\n'
     || E'           end as ids\n'
     || E'     where exists (select 1 from public.encargo e\n'
     || E'                    where e.id = (p ->> ''encargo_id'')::uuid\n'
     || E'                      and e.organizacion_id = any (privado.mis_organizaciones()))\n  ),'],
    [E'     where r.encargo_id = parametros.encargo\n',
     E'     where r.encargo_id = parametros.encargo\n'
     || E'       and (parametros.ids is null or r.id = any (parametros.ids))\n'],
    [E'\n STABLE\n', E'\n STABLE SECURITY DEFINER\n']
  ];
  i int;
begin
  for i in 1 .. array_length(v_cambios, 1) loop
    if position(v_cambios[i][1] in v_def) = 0 then
      raise exception 'expediente_base cambió (cambio %): revisa la migración', i;
    end if;
    v_def := replace(v_def, v_cambios[i][1], v_cambios[i][2]);
  end loop;
  execute v_def;
end;
$$;
revoke all on function privado.expediente_base(jsonb) from public, anon;
grant execute on function privado.expediente_base(jsonb) to authenticated;

create or replace function public.expediente_registros(p jsonb)
returns table (
  registro_id uuid, resumen text, expediente_id uuid, expediente text, tipo text,
  categoria_id uuid, categoria text, origen text, fecha date, fuente text, documento_id uuid,
  archivo text, sha256 text, hoja text, fila int, estado_validacion text, estado_extraccion text,
  involucrados jsonb, identificadores jsonb, referencias text[], montos jsonb, nivel text,
  alertas int, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with filas as (
    select f.*, count(*) over () as total,
           row_number() over (
             order by
               case when coalesce(p ->> 'dir', 'desc') = 'asc' then f.clave end asc nulls last,
               case when coalesce(p ->> 'dir', 'desc') <> 'asc' then f.clave end desc nulls last,
               f.creado_en, f.registro_id) as rn
      from privado.expediente_filas(p) f
  ),
  pagina as (
    select * from filas
     order by rn
     limit least(greatest(coalesce((p ->> 'limite')::int, 50), 1), 500)
    offset greatest(coalesce((p ->> 'desplazamiento')::int, 0), 0)
  )
  select b.registro_id, b.resumen, b.expediente_id, b.expediente, b.tipo, b.categoria_id, b.categoria,
         b.origen, b.fecha, b.fuente, b.documento_id, b.archivo, b.sha256, b.hoja, b.fila,
         b.estado_validacion, b.estado_extraccion, b.involucrados, b.identificadores, b.referencias,
         b.montos, b.nivel, b.alertas, pg.total
    from pagina pg
    join privado.expediente_base(
           (p - 'q' - 'desde' - 'hasta')
           || jsonb_build_object('ids', (select coalesce(jsonb_agg(x.registro_id), '[]'::jsonb) from pagina x))
         ) b on b.registro_id = pg.registro_id
   order by pg.rn;
$$;

create or replace function public.expediente_arbol(p jsonb)
returns table (
  nivel smallint, expediente_id uuid, expediente text, entidad_id uuid, entidad text, entidad_tipo text,
  categoria_id uuid, categoria text, registros bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select f.registro_id, f.expediente_id, x.identificador as expediente, f.categoria_id,
           c.nombre as categoria, f.entidades
      from privado.expediente_filas(p || '{"_entidades": true}'::jsonb) f
      left join public.expediente x on x.id = f.expediente_id
      left join public.categoria_documental c on c.id = f.categoria_id
  ),
  por_entidad as (
    select b.*, ent.id as entidad_id
      from base b
      left join lateral unnest(case when cardinality(b.entidades) > 0 then b.entidades
                                    else array[null::uuid] end) ent(id) on true
  )
  select g.nivel, g.expediente_id, g.expediente, g.entidad_id, e.nombre, e.tipo, g.categoria_id, g.categoria,
         g.registros
    from (
      select 1::smallint as nivel, expediente_id, max(expediente) as expediente, null::uuid as entidad_id,
             null::uuid as categoria_id, null::text as categoria, count(distinct registro_id) as registros
        from base group by expediente_id
      union all
      select 2, expediente_id, max(expediente), entidad_id, null, null, count(distinct registro_id)
        from por_entidad group by expediente_id, entidad_id
      union all
      select 3, expediente_id, max(expediente), entidad_id, categoria_id, max(categoria), count(distinct registro_id)
        from por_entidad group by expediente_id, entidad_id, categoria_id
    ) g
    left join public.entidad e on e.id = g.entidad_id
   order by g.expediente nulls last, g.nivel, g.registros desc, e.nombre nulls last, g.categoria nulls last;
$$;

-- Búsquedas por registro sin el encargo delante (subconsultas del expediente documental).
create index extraccion_registro_solo_idx on public.extraccion (registro_id);
create index evidencia_registro_solo_idx on public.evidencia (registro_id, objeto_tipo);

-- ---------------------------------------------------------------------------
-- 5. Índices y permisos sobrantes
-- ---------------------------------------------------------------------------
drop index if exists public.lista_69b_organizacion_idx;
create index lista_69b_organizacion_carga_idx on public.lista_69b (organizacion_id, carga_id);
create index organizacion_creado_por_idx on public.organizacion (creado_por);

-- Sin política de DELETE ya se negaba; se retira el permiso para que no dependa solo de RLS.
revoke delete on public.organizacion from authenticated;
revoke insert, update, delete, truncate on public.importacion_resumen from authenticated, anon;
