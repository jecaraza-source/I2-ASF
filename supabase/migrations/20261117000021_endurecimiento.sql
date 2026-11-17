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

-- Búsquedas por registro sin el encargo delante (subconsultas del expediente documental).
create index extraccion_registro_solo_idx on public.extraccion (registro_id);
create index evidencia_registro_solo_idx on public.evidencia (registro_id, objeto_tipo);

-- El expediente documental arma, por cada registro, involucrados, referencias, montos y nivel con
-- subconsultas sobre seis tablas; con RLS cada una vuelve a evaluar la membresía y 50,000 registros
-- tardaban casi un minuto. La base se ejecuta ahora como dueño (sin RLS) después de verificar que
-- quien consulta es miembro de la organización del encargo: todo lo demás se filtra por ese encargo.
-- Las funciones públicas (expediente_registros y expediente_arbol) siguen siendo SECURITY INVOKER.
do $$
declare
  v_def text := pg_get_functiondef('privado.expediente_base(jsonb)'::regprocedure);
  v_antes text := E'                  where length(t) > 0 limit 8) as terminos\n  ),';
  v_despues text := E'                  where length(t) > 0 limit 8) as terminos\n'
    || E'     where exists (select 1 from public.encargo e\n'
    || E'                    where e.id = (p ->> ''encargo_id'')::uuid\n'
    || E'                      and e.organizacion_id = any (privado.mis_organizaciones()))\n  ),';
begin
  if position(v_antes in v_def) = 0 then
    raise exception 'expediente_base cambió: revisa la verificación de membresía';
  end if;
  v_def := replace(v_def, v_antes, v_despues);
  v_def := replace(v_def, E'\n STABLE\n', E'\n STABLE SECURITY DEFINER\n');
  if position('SECURITY DEFINER' in v_def) = 0 then
    raise exception 'no se pudo marcar expediente_base como SECURITY DEFINER';
  end if;
  execute v_def;
end;
$$;
revoke all on function privado.expediente_base(jsonb) from public, anon;
grant execute on function privado.expediente_base(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Índices y permisos sobrantes
-- ---------------------------------------------------------------------------
drop index if exists public.lista_69b_organizacion_idx;
create index lista_69b_organizacion_carga_idx on public.lista_69b (organizacion_id, carga_id);
create index organizacion_creado_por_idx on public.organizacion (creado_por);

-- Sin política de DELETE ya se negaba; se retira el permiso para que no dependa solo de RLS.
revoke delete on public.organizacion from authenticated;
revoke insert, update, delete, truncate on public.importacion_resumen from authenticated, anon;
