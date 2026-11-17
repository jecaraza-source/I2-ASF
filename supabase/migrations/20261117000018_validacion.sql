-- Tarea 09 (parte 2) · Migración 18: validación de extracciones.
-- docs/ESPECIFICACION.md §7.2.
--
--  * `extraccion.valor_original`: al corregir un campo se conserva aquí lo que leyó la IA.
--  * `validar_registro`: aplica la decisión del auditor campo por campo y, solo entonces, crea
--    entidades, evento y evidencias (regla 4: la IA propone y el auditor dispone).
--  * `rechazar_registro`: descarta la lectura completa, con motivo.
--  * Todo queda en bitácora.

alter table public.extraccion
  add column valor_original jsonb
    check (valor_original is null or jsonb_typeof(valor_original) = 'object');

comment on column public.extraccion.valor_original is
  'Solo en extracciones corregidas: { valor_crudo, valor_normalizado } tal como los leyó la IA.';

-- La cola de validación: documentos leídos y aún no validados.
create index registro_cola_validacion_idx
  on public.registro (encargo_id, creado_en)
  where origen = 'documento' and estado_extraccion = 'hecha' and estado_validacion = 'pendiente';

-- ---------------------------------------------------------------------------
-- materializar_registro: entidades, evento y evidencias de un registro ya validado.
-- Misma resolución de entidades que `capturar_registro` (§10): mismo RFC válido, o mismo tipo y
-- nombre sin RFC que lo contradiga. Security invoker: RLS decide. No se expone por la API (esquema
-- privado); solo la llama `validar_registro`.
--   p = { involucrados: [{ campo, tipo, nombre, nombre_normalizado, rol, identificadores }],
--         evento: null | { tipo, fecha_hora, monto, moneda, atributos, participantes: [{ indice, rol }] } }
-- ---------------------------------------------------------------------------
create function privado.materializar_registro(p_org uuid, p_enc uuid, p_reg uuid, p jsonb)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_i jsonb;
  v_ent uuid;
  v_rfc text;
  v_entidades uuid[] := '{}';
  v_evento uuid;
begin
  for v_i in select * from jsonb_array_elements(coalesce(p -> 'involucrados', '[]'::jsonb)) loop
    v_ent := null;
    v_rfc := case when coalesce(v_i -> 'identificadores' -> 'invalidos', '[]'::jsonb) ? 'rfc' then null
                  else nullif(v_i -> 'identificadores' ->> 'rfc', '') end;
    if v_rfc is not null then
      select coalesce(e.fusionada_en, e.id) into v_ent
        from public.entidad e
       where e.encargo_id = p_enc and e.identificadores ->> 'rfc' = v_rfc
         and not coalesce(e.identificadores -> 'invalidos', '[]'::jsonb) ? 'rfc'
       order by e.creado_en limit 1;
    end if;
    if v_ent is null then
      select coalesce(e.fusionada_en, e.id) into v_ent
        from public.entidad e
       where e.encargo_id = p_enc and e.tipo = v_i ->> 'tipo'
         and e.nombre_normalizado = v_i ->> 'nombre_normalizado'
         and (v_rfc is null or e.identificadores ->> 'rfc' is null or e.identificadores ->> 'rfc' = v_rfc)
       order by e.creado_en limit 1;
    end if;

    if v_ent is null then
      insert into public.entidad (organizacion_id, encargo_id, tipo, nombre, nombre_normalizado, identificadores)
      values (p_org, p_enc, v_i ->> 'tipo', v_i ->> 'nombre', v_i ->> 'nombre_normalizado',
              coalesce(v_i -> 'identificadores', '{}'::jsonb))
      returning id into v_ent;
    else
      -- Lo ya conocido manda; el documento solo agrega identificadores que faltaban.
      update public.entidad e
         set identificadores = coalesce(v_i -> 'identificadores', '{}'::jsonb) || e.identificadores
       where e.id = v_ent
         and not (e.identificadores @> (coalesce(v_i -> 'identificadores', '{}'::jsonb) - 'invalidos'));
    end if;
    v_entidades := v_entidades || v_ent;

    insert into public.registro_entidad (organizacion_id, encargo_id, registro_id, entidad_id, rol)
    values (p_org, p_enc, p_reg, v_ent, v_i ->> 'rol')
    on conflict (registro_id, entidad_id, rol) do nothing;

    -- La evidencia apunta a la extracción validada que sostiene al involucrado (página incluida).
    insert into public.evidencia (organizacion_id, encargo_id, objeto_tipo, objeto_id, registro_id, extraccion_id)
    select p_org, p_enc, 'entidad', v_ent, p_reg,
           (select x.id from public.extraccion x
             where x.registro_id = p_reg and x.campo = v_i ->> 'campo'
               and x.estado in ('validado', 'corregido')
             order by x.creado_en desc limit 1)
     where not exists (select 1 from public.evidencia ev
                        where ev.objeto_tipo = 'entidad' and ev.objeto_id = v_ent and ev.registro_id = p_reg);
  end loop;

  if jsonb_typeof(p -> 'evento') = 'object' then
    insert into public.evento (organizacion_id, encargo_id, tipo, fecha_hora, monto, moneda, atributos)
    values (p_org, p_enc, p -> 'evento' ->> 'tipo', nullif(p -> 'evento' ->> 'fecha_hora', '')::timestamptz,
            nullif(p -> 'evento' ->> 'monto', '')::numeric, nullif(p -> 'evento' ->> 'moneda', ''),
            coalesce(p -> 'evento' -> 'atributos', '{}'::jsonb))
    returning id into v_evento;

    insert into public.evento_participante (organizacion_id, encargo_id, evento_id, entidad_id, rol)
    select distinct on (v_entidades[(x ->> 'indice')::int + 1], x ->> 'rol')
           p_org, p_enc, v_evento, v_entidades[(x ->> 'indice')::int + 1], x ->> 'rol'
      from jsonb_array_elements(coalesce(p -> 'evento' -> 'participantes', '[]'::jsonb)) x
     where v_entidades[(x ->> 'indice')::int + 1] is not null;

    insert into public.evidencia (organizacion_id, encargo_id, objeto_tipo, objeto_id, registro_id)
    values (p_org, p_enc, 'evento', v_evento, p_reg);
  end if;
  return coalesce(array_length(v_entidades, 1), 0);
end;
$$;
revoke all on function privado.materializar_registro(uuid, uuid, uuid, jsonb) from public, anon;
grant execute on function privado.materializar_registro(uuid, uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- validar_registro: decisión del auditor sobre un documento leído por la IA.
--   p = { registro_id, expediente_id, fecha_documento, resumen,
--         decisiones: [{ extraccion_id, estado: validado | corregido | rechazado,
--                        valor_crudo, valor_normalizado }],   -- una por cada lectura de la IA
--         nuevas: [{ campo, valor_crudo, valor_normalizado }], -- datos que agregó el auditor
--         involucrados, evento }                              -- ver materializar_registro
-- Toda lectura de la IA recibe una decisión; si falta alguna, no se guarda nada.
-- Security invoker: RLS decide (admin y auditor).
-- ---------------------------------------------------------------------------
create function public.validar_registro(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.registro;
  v_actor uuid := (select auth.uid());
  v_lecturas int;
  v_decididas int;
  v_corregidas int;
  v_rechazadas int;
  v_nuevas int;
  v_entidades int;
begin
  select * into r from public.registro where id = (p ->> 'registro_id')::uuid for update;
  if not found then
    raise exception 'registro inexistente' using errcode = 'P0002';
  end if;
  if r.origen <> 'documento' or r.estado_extraccion <> 'hecha' or r.estado_validacion <> 'pendiente' then
    raise exception 'ya_validado: el registro no está en la cola de validación' using errcode = '22023';
  end if;
  if exists (select 1 from jsonb_array_elements(coalesce(p -> 'decisiones', '[]'::jsonb)) d
              where d ->> 'estado' not in ('validado', 'corregido', 'rechazado')) then
    raise exception 'decisión no válida' using errcode = '22023';
  end if;

  select count(*) into v_lecturas from public.extraccion x
   where x.registro_id = r.id and x.metodo = 'ia';

  update public.extraccion x
     set estado = d.estado,
         validado_por = v_actor,
         validado_en = now(),
         valor_original = case when d.estado = 'corregido'
           then jsonb_build_object('valor_crudo', x.valor_crudo, 'valor_normalizado', x.valor_normalizado)
           end,
         valor_crudo = case when d.estado = 'corregido' then d.valor_crudo else x.valor_crudo end,
         valor_normalizado = case when d.estado = 'corregido' then d.valor_normalizado
                                  else x.valor_normalizado end
    from (select (e ->> 'extraccion_id')::uuid as id, e ->> 'estado' as estado,
                 e ->> 'valor_crudo' as valor_crudo, e -> 'valor_normalizado' as valor_normalizado
            from jsonb_array_elements(coalesce(p -> 'decisiones', '[]'::jsonb)) e) d
   where x.id = d.id and x.registro_id = r.id and x.metodo = 'ia';
  get diagnostics v_decididas = row_count;
  if v_decididas <> v_lecturas
     or v_decididas <> jsonb_array_length(coalesce(p -> 'decisiones', '[]'::jsonb)) then
    raise exception 'decisiones_incompletas: cada lectura de la IA necesita una decisión'
      using errcode = '22023';
  end if;
  select count(*) filter (where x.estado = 'corregido'), count(*) filter (where x.estado = 'rechazado')
    into v_corregidas, v_rechazadas
    from public.extraccion x where x.registro_id = r.id and x.metodo = 'ia';

  insert into public.extraccion
    (organizacion_id, encargo_id, registro_id, campo, valor_crudo, valor_normalizado, metodo, estado,
     validado_por, validado_en)
  select r.organizacion_id, r.encargo_id, r.id, n ->> 'campo', n ->> 'valor_crudo', n -> 'valor_normalizado',
         'manual', 'validado', v_actor, now()
    from jsonb_array_elements(coalesce(p -> 'nuevas', '[]'::jsonb)) n;
  get diagnostics v_nuevas = row_count;

  if not exists (select 1 from public.extraccion x
                  where x.registro_id = r.id and x.estado in ('validado', 'corregido')) then
    raise exception 'sin_datos: un registro validado necesita al menos un dato' using errcode = '22023';
  end if;

  update public.registro
     set estado_validacion = case when v_corregidas + v_rechazadas + v_nuevas > 0 then 'corregido'
                                  else 'validado' end,
         expediente_id = nullif(p ->> 'expediente_id', '')::uuid,
         fecha_documento = nullif(p ->> 'fecha_documento', '')::date,
         resumen = coalesce(nullif(left(p ->> 'resumen', 255), ''), resumen)
   where id = r.id;

  v_entidades := privado.materializar_registro(r.organizacion_id, r.encargo_id, r.id, p);

  insert into public.bitacora (organizacion_id, encargo_id, actor, accion, objeto_tipo, objeto_id, detalle)
  values (r.organizacion_id, r.encargo_id, v_actor, 'registro.validacion', 'registro', r.id,
          jsonb_build_object('lecturas', v_lecturas, 'corregidas', v_corregidas,
                             'rechazadas', v_rechazadas, 'agregadas', v_nuevas,
                             'entidades', v_entidades));
  return jsonb_build_object('lecturas', v_lecturas, 'corregidas', v_corregidas,
                            'rechazadas', v_rechazadas, 'agregadas', v_nuevas, 'entidades', v_entidades);
end;
$$;
revoke all on function public.validar_registro(jsonb) from public, anon;
grant execute on function public.validar_registro(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- rechazar_registro: la lectura completa no sirve (documento equivocado, ilegible…).
-- No crea entidades. El registro queda rechazado, con el motivo en bitácora.
-- ---------------------------------------------------------------------------
create function public.rechazar_registro(p_registro uuid, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.registro;
  v_actor uuid := (select auth.uid());
  v_motivo text := nullif(trim(coalesce(p_motivo, '')), '');
begin
  select * into r from public.registro where id = p_registro for update;
  if not found then
    raise exception 'registro inexistente' using errcode = 'P0002';
  end if;
  if r.origen <> 'documento' or r.estado_extraccion <> 'hecha' or r.estado_validacion <> 'pendiente' then
    raise exception 'ya_validado: el registro no está en la cola de validación' using errcode = '22023';
  end if;
  if v_motivo is null or length(v_motivo) < 5 then
    raise exception 'motivo: explica por qué se rechaza' using errcode = '22023';
  end if;
  update public.extraccion
     set estado = 'rechazado', validado_por = v_actor, validado_en = now()
   where registro_id = r.id and metodo = 'ia';
  update public.registro set estado_validacion = 'rechazado' where id = r.id;
  if not found then
    raise exception 'sin permiso para rechazar' using errcode = '42501';
  end if;
  insert into public.bitacora (organizacion_id, encargo_id, actor, accion, objeto_tipo, objeto_id, detalle)
  values (r.organizacion_id, r.encargo_id, v_actor, 'registro.rechazo', 'registro', r.id,
          jsonb_build_object('motivo', left(v_motivo, 500)));
end;
$$;
revoke all on function public.rechazar_registro(uuid, text) from public, anon;
grant execute on function public.rechazar_registro(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- R11: al leer el documento asociado a una captura, el procesador ejecuta las reglas para que la
-- diferencia aparezca como alerta sin esperar a que alguien las corra a mano.
-- ---------------------------------------------------------------------------
grant execute on function public.guardar_alertas(jsonb) to service_role;
