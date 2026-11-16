-- Tarea 04 · Generación y calificación de la red.
-- docs/ESPECIFICACION.md §9. Todo con security invoker: RLS decide.

-- ---------------------------------------------------------------------------
-- Fusiones: la entidad absorbida queda como alias de la canónica. No se
-- reescribe ningún vínculo, evento ni evidencia (trazabilidad intacta).
-- ---------------------------------------------------------------------------
alter table public.entidad add column fusionada_en uuid;
alter table public.entidad
  add constraint entidad_fusionada_en_fk
  foreign key (encargo_id, fusionada_en) references public.entidad (encargo_id, id);
alter table public.entidad add constraint entidad_fusion_propia check (fusionada_en is distinct from id);
create index entidad_fusionada_en_idx on public.entidad (encargo_id, fusionada_en) where fusionada_en is not null;

-- Un par se propone una sola vez (en cualquier orden); un rechazo no se repite.
create unique index fusion_propuesta_par_idx
  on public.fusion_propuesta (encargo_id, least(entidad_a, entidad_b), greatest(entidad_a, entidad_b));

-- ---------------------------------------------------------------------------
-- guardar_red: una generación completa (nodos, vínculos, calificaciones y
-- fusiones propuestas) en una transacción.
-- ---------------------------------------------------------------------------
create function public.guardar_red(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid := (p ->> 'organizacion_id')::uuid;
  v_enc uuid := (p ->> 'encargo_id')::uuid;
  v_red uuid;
begin
  insert into public.red_generada (organizacion_id, encargo_id, semillas, alcance, version_reglas, resumen)
  values (
    v_org, v_enc,
    array(select jsonb_array_elements_text(p -> 'semillas'))::uuid[],
    (p ->> 'alcance')::smallint,
    (p ->> 'version_reglas')::int,
    coalesce(p -> 'resumen', '{}'::jsonb)
  )
  returning id into v_red;

  insert into public.red_nodo (organizacion_id, encargo_id, red_id, entidad_id, distancia)
  select v_org, v_enc, v_red, (n ->> 'entidad_id')::uuid, (n ->> 'distancia')::smallint
    from jsonb_array_elements(coalesce(p -> 'nodos', '[]'::jsonb)) n;

  insert into public.red_vinculo (organizacion_id, encargo_id, red_id, vinculo_id)
  select v_org, v_enc, v_red, v::uuid
    from jsonb_array_elements_text(coalesce(p -> 'vinculos', '[]'::jsonb)) v;

  insert into public.calificacion (organizacion_id, encargo_id, red_id, objeto_tipo, objeto_id, puntaje, nivel, criterios)
  select v_org, v_enc, v_red, c ->> 'objeto_tipo', (c ->> 'objeto_id')::uuid, (c ->> 'puntaje')::numeric,
         c ->> 'nivel', coalesce(c -> 'criterios', '[]'::jsonb)
    from jsonb_array_elements(coalesce(p -> 'calificaciones', '[]'::jsonb)) c;

  insert into public.fusion_propuesta (organizacion_id, encargo_id, entidad_a, entidad_b, motivo)
  select v_org, v_enc, (f ->> 'entidad_a')::uuid, (f ->> 'entidad_b')::uuid, f ->> 'motivo'
    from jsonb_array_elements(coalesce(p -> 'fusiones', '[]'::jsonb)) f
  on conflict do nothing;

  insert into public.bitacora (organizacion_id, encargo_id, actor, accion, objeto_tipo, objeto_id, detalle)
  values (
    v_org, v_enc, (select auth.uid()), 'red.generada', 'red_generada', v_red,
    jsonb_build_object(
      'alcance', p -> 'alcance',
      'version_reglas', p -> 'version_reglas',
      'semillas', jsonb_array_length(coalesce(p -> 'semillas', '[]'::jsonb)),
      'nodos', jsonb_array_length(coalesce(p -> 'nodos', '[]'::jsonb)),
      'vinculos', jsonb_array_length(coalesce(p -> 'vinculos', '[]'::jsonb)),
      'fusiones_propuestas', jsonb_array_length(coalesce(p -> 'fusiones', '[]'::jsonb))
    )
  );
  return v_red;
end;
$$;
revoke all on function public.guardar_red(jsonb) from public, anon;
grant execute on function public.guardar_red(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- resolver_fusion: aceptar (B pasa a ser alias de A) o rechazar.
-- ---------------------------------------------------------------------------
create function public.resolver_fusion(p_fusion uuid, p_aceptar boolean)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  f public.fusion_propuesta;
  v_a uuid;
begin
  select * into f from public.fusion_propuesta where id = p_fusion;
  if not found then
    raise exception 'fusión inexistente' using errcode = 'P0002';
  end if;
  if f.estado <> 'propuesta' then
    raise exception 'la fusión ya fue resuelta' using errcode = '22023';
  end if;

  update public.fusion_propuesta
     set estado = case when p_aceptar then 'aceptada' else 'rechazada' end,
         resuelta_por = (select auth.uid())
   where id = p_fusion and estado = 'propuesta';
  if not found then
    -- RLS oculta la fila a quien no puede actualizarla (lector).
    raise exception 'sin permiso para resolver la fusión' using errcode = '42501';
  end if;

  if p_aceptar then
    -- La canónica de A (si A ya se fusionó antes, se sigue la cadena).
    with recursive cadena as (
      select e.id, e.fusionada_en, 1 as n from public.entidad e where e.id = f.entidad_a
      union all
      select e.id, e.fusionada_en, c.n + 1 from public.entidad e join cadena c on e.id = c.fusionada_en
       where c.n < 20
    )
    select id into v_a from cadena where fusionada_en is null limit 1;
    if v_a is null or v_a = f.entidad_b then
      raise exception 'la fusión formaría un ciclo' using errcode = '22023';
    end if;

    update public.entidad set fusionada_en = v_a where id = f.entidad_b and fusionada_en is null;
    if not found then
      raise exception 'la entidad B ya está fusionada o no tienes permiso' using errcode = '42501';
    end if;

    insert into public.alias_entidad (organizacion_id, encargo_id, entidad_id, alias)
    select f.organizacion_id, f.encargo_id, v_a, b.nombre from public.entidad b where b.id = f.entidad_b
    on conflict (entidad_id, alias) do nothing;
  end if;

  insert into public.bitacora (organizacion_id, encargo_id, actor, accion, objeto_tipo, objeto_id, detalle)
  values (
    f.organizacion_id, f.encargo_id, (select auth.uid()),
    case when p_aceptar then 'fusion.aceptada' else 'fusion.rechazada' end,
    'fusion_propuesta', f.id,
    jsonb_build_object('entidad_a', f.entidad_a, 'entidad_b', f.entidad_b)
  );
end;
$$;
revoke all on function public.resolver_fusion(uuid, boolean) from public, anon;
grant execute on function public.resolver_fusion(uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- nueva_version_reglas: guarda los criterios como versión N+1 y desactiva las
-- anteriores. Solo admin (RLS de regla_calificacion).
-- ---------------------------------------------------------------------------
create function public.nueva_version_reglas(p_organizacion uuid, p_reglas jsonb)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_version int;
begin
  if jsonb_typeof(p_reglas) <> 'array' or jsonb_array_length(p_reglas) = 0 then
    raise exception 'se requiere al menos un criterio' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('reglas:' || p_organizacion::text, 0));
  select coalesce(max(version), 0) + 1 into v_version
    from public.regla_calificacion where organizacion_id = p_organizacion;

  update public.regla_calificacion set activa = false
   where organizacion_id = p_organizacion and activa;

  insert into public.regla_calificacion (organizacion_id, version, criterio, peso, parametros, activa)
  select p_organizacion, v_version, r ->> 'criterio', (r ->> 'peso')::numeric,
         coalesce(r -> 'parametros', '{}'::jsonb), true
    from jsonb_array_elements(p_reglas) r;

  insert into public.bitacora (organizacion_id, actor, accion, objeto_tipo, detalle)
  values (p_organizacion, (select auth.uid()), 'reglas.version', 'regla_calificacion',
          jsonb_build_object('version', v_version, 'criterios', jsonb_array_length(p_reglas)));
  return v_version;
end;
$$;
revoke all on function public.nueva_version_reglas(uuid, jsonb) from public, anon;
grant execute on function public.nueva_version_reglas(uuid, jsonb) to authenticated;
