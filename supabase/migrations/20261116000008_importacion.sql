-- Tarea 03 · Carga transaccional de una importación de Excel.
-- docs/ESPECIFICACION.md §8. La función corre con los permisos de quien la
-- llama (security invoker): RLS decide; si algo falla, no queda nada.

create function public.importar_excel(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_org uuid := (p ->> 'organizacion_id')::uuid;
  v_enc uuid := (p ->> 'encargo_id')::uuid;
  v_exp uuid := nullif(p ->> 'expediente_id', '')::uuid;
  v_fuente text := nullif(trim(p ->> 'fuente'), '');
  v_uid uuid := (select auth.uid());
  v_doc uuid;
  v_reg jsonb;
  v_ent jsonb := '{}'::jsonb;
  v_e jsonb;
  v_id uuid;
  v_rfc text;
  v_nuevas int := 0;
  v_existentes int := 0;
  v_vinculos int := 0;
  v_eventos int := 0;
begin
  if v_org is null or v_enc is null then
    raise exception 'organizacion_id y encargo_id son obligatorios' using errcode = '22023';
  end if;
  if jsonb_typeof(p -> 'registros') <> 'array' or jsonb_array_length(p -> 'registros') = 0 then
    raise exception 'la importación no tiene registros' using errcode = '22023';
  end if;

  -- 1. Documento de origen (el Excel), identificado por su SHA-256.
  insert into public.documento_origen (
    organizacion_id, encargo_id, expediente_id, sha256, storage_path, nombre_archivo, mime, tamano, fuente
  )
  values (
    v_org, v_enc, v_exp,
    p -> 'documento' ->> 'sha256',
    p -> 'documento' ->> 'storage_path',
    p -> 'documento' ->> 'nombre_archivo',
    p -> 'documento' ->> 'mime',
    (p -> 'documento' ->> 'tamano')::bigint,
    v_fuente
  )
  returning id into v_doc;

  -- 2. Registros (uno por fila válida y uno por hoja de cifras) y sus extracciones.
  select coalesce(jsonb_object_agg(r ->> 'clave', gen_random_uuid()), '{}'::jsonb)
    into v_reg
    from jsonb_array_elements(p -> 'registros') r;

  insert into public.registro (
    id, organizacion_id, encargo_id, expediente_id, origen, documento_id, fuente,
    fecha_documento, estado_validacion, resumen
  )
  select (v_reg ->> (r ->> 'clave'))::uuid, v_org, v_enc, v_exp, 'importacion', v_doc,
         coalesce(v_fuente, p -> 'documento' ->> 'nombre_archivo'),
         nullif(r ->> 'fecha_documento', '')::date, 'validado', r ->> 'resumen'
    from jsonb_array_elements(p -> 'registros') r;

  insert into public.extraccion (
    organizacion_id, encargo_id, registro_id, campo, valor_crudo, valor_normalizado,
    ubicacion, metodo, estado, validado_por, validado_en
  )
  select v_org, v_enc, (v_reg ->> (r ->> 'clave'))::uuid, x ->> 'campo', x ->> 'valor_crudo',
         x -> 'valor_normalizado', coalesce(x -> 'ubicacion', '{}'::jsonb), 'importacion', 'validado',
         v_uid, now()
    from jsonb_array_elements(p -> 'registros') r,
         jsonb_array_elements(r -> 'extracciones') x;

  -- 3. Entidades: se reutiliza la del encargo con el mismo RFC válido, el mismo
  --    teléfono o el mismo nombre normalizado (§8); si no existe, se crea.
  for v_e in select * from jsonb_array_elements(coalesce(p -> 'entidades', '[]'::jsonb)) loop
    v_rfc := case
      when (v_e -> 'identificadores' ? 'rfc')
           and not coalesce((v_e -> 'identificadores' -> 'invalidos') ? 'rfc', false)
      then v_e -> 'identificadores' ->> 'rfc'
    end;
    v_id := null;
    if v_rfc is not null then
      select e.id into v_id from public.entidad e
       where e.encargo_id = v_enc
         and e.identificadores ->> 'rfc' = v_rfc
         and not coalesce((e.identificadores -> 'invalidos') ? 'rfc', false)
       limit 1;
    end if;
    if v_id is null and v_e ->> 'tipo' = 'telefono' then
      select e.id into v_id from public.entidad e
       where e.encargo_id = v_enc and e.tipo = 'telefono'
         and e.identificadores ->> 'telefono' = v_e -> 'identificadores' ->> 'telefono'
       limit 1;
    end if;
    if v_id is null and v_e ->> 'tipo' <> 'telefono' then
      select e.id into v_id from public.entidad e
       where e.encargo_id = v_enc and e.tipo <> 'telefono'
         and e.nombre_normalizado = v_e ->> 'nombre_normalizado'
         and (v_rfc is null
              or e.identificadores ->> 'rfc' is null
              or e.identificadores ->> 'rfc' = v_rfc)
       limit 1;
    end if;

    if v_id is null then
      insert into public.entidad (
        organizacion_id, encargo_id, tipo, nombre, nombre_normalizado, identificadores, atributos, riesgo_declarado
      )
      values (
        v_org, v_enc, v_e ->> 'tipo', v_e ->> 'nombre', v_e ->> 'nombre_normalizado',
        coalesce(v_e -> 'identificadores', '{}'::jsonb), coalesce(v_e -> 'atributos', '{}'::jsonb),
        nullif(v_e ->> 'riesgo_declarado', '')
      )
      returning id into v_id;
      v_nuevas := v_nuevas + 1;
    else
      update public.entidad e
         set tipo = case when e.tipo = 'otro' then v_e ->> 'tipo' else e.tipo end,
             identificadores = coalesce(v_e -> 'identificadores', '{}'::jsonb) || e.identificadores,
             atributos = (coalesce(v_e -> 'atributos', '{}'::jsonb) || e.atributos)
               || jsonb_build_object('tipos_declarados', (
                    select coalesce(jsonb_agg(distinct t), '[]'::jsonb)
                      from (
                        select jsonb_array_elements_text(coalesce(e.atributos -> 'tipos_declarados', '[]'::jsonb))
                        union
                        select jsonb_array_elements_text(coalesce(v_e -> 'atributos' -> 'tipos_declarados', '[]'::jsonb))
                      ) as u(t))),
             riesgo_declarado = coalesce(e.riesgo_declarado, nullif(v_e ->> 'riesgo_declarado', ''))
       where e.id = v_id;
      v_existentes := v_existentes + 1;
    end if;
    v_ent := v_ent || jsonb_build_object(v_e ->> 'clave', v_id);

    -- Involucrados y evidencia: cada aparición de la entidad apunta a su registro.
    insert into public.registro_entidad (organizacion_id, encargo_id, registro_id, entidad_id, rol)
    select v_org, v_enc, (v_reg ->> (a ->> 'registro'))::uuid, v_id, a ->> 'rol'
      from jsonb_array_elements(coalesce(v_e -> 'apariciones', '[]'::jsonb)) a
    on conflict (registro_id, entidad_id, rol) do nothing;

    insert into public.evidencia (organizacion_id, encargo_id, objeto_tipo, objeto_id, registro_id)
    select distinct v_org, v_enc, 'entidad', v_id, (v_reg ->> (a ->> 'registro'))::uuid
      from jsonb_array_elements(coalesce(v_e -> 'apariciones', '[]'::jsonb)) a;
  end loop;

  -- 4. Vínculos declarados, cada uno con su registro de origen.
  for v_e in select * from jsonb_array_elements(coalesce(p -> 'vinculos', '[]'::jsonb)) loop
    insert into public.vinculo (
      organizacion_id, encargo_id, origen_id, destino_id, tipo, fuerza, fuerza_original, fecha_inicio, dirigido
    )
    values (
      v_org, v_enc, (v_ent ->> (v_e ->> 'origen'))::uuid, (v_ent ->> (v_e ->> 'destino'))::uuid,
      v_e ->> 'tipo', (v_e ->> 'fuerza')::smallint, v_e ->> 'fuerza_original',
      nullif(v_e ->> 'fecha_inicio', '')::date, coalesce((v_e ->> 'dirigido')::boolean, false)
    )
    returning id into v_id;

    insert into public.evidencia (organizacion_id, encargo_id, objeto_tipo, objeto_id, registro_id)
    values (v_org, v_enc, 'vinculo', v_id, (v_reg ->> (v_e ->> 'registro'))::uuid);
    v_vinculos := v_vinculos + 1;
  end loop;

  -- 5. Eventos, participantes y evidencia.
  for v_e in select * from jsonb_array_elements(coalesce(p -> 'eventos', '[]'::jsonb)) loop
    insert into public.evento (organizacion_id, encargo_id, tipo, fecha_hora, monto, moneda, atributos)
    values (
      v_org, v_enc, v_e ->> 'tipo', nullif(v_e ->> 'fecha_hora', '')::timestamptz,
      nullif(v_e ->> 'monto', '')::numeric(18, 2), nullif(v_e ->> 'moneda', ''),
      coalesce(v_e -> 'atributos', '{}'::jsonb)
    )
    returning id into v_id;

    insert into public.evento_participante (organizacion_id, encargo_id, evento_id, entidad_id, rol)
    select v_org, v_enc, v_id, (v_ent ->> (pa ->> 'entidad'))::uuid, pa ->> 'rol'
      from jsonb_array_elements(coalesce(v_e -> 'participantes', '[]'::jsonb)) pa
    on conflict (evento_id, entidad_id, rol) do nothing;

    insert into public.evidencia (organizacion_id, encargo_id, objeto_tipo, objeto_id, registro_id)
    values (v_org, v_enc, 'evento', v_id, (v_reg ->> (v_e ->> 'registro'))::uuid);
    v_eventos := v_eventos + 1;
  end loop;

  -- 6. Bitácora de la carga (solo conteos e IDs).
  insert into public.bitacora (organizacion_id, encargo_id, actor, accion, objeto_tipo, objeto_id, detalle)
  values (
    v_org, v_enc, v_uid, 'importacion.carga', 'documento_origen', v_doc,
    jsonb_build_object(
      'plantilla', p ->> 'plantilla',
      'registros', jsonb_array_length(p -> 'registros'),
      'entidades_nuevas', v_nuevas,
      'entidades_existentes', v_existentes,
      'vinculos', v_vinculos,
      'eventos', v_eventos,
      'hojas', coalesce(p -> 'hojas', '[]'::jsonb)
    )
  );

  return jsonb_build_object(
    'documento_id', v_doc,
    'registros', jsonb_array_length(p -> 'registros'),
    'entidades_nuevas', v_nuevas,
    'entidades_existentes', v_existentes,
    'vinculos', v_vinculos,
    'eventos', v_eventos
  );
end;
$$;

revoke all on function public.importar_excel(jsonb) from public, anon;
grant execute on function public.importar_excel(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Resumen de cada importación (respeta RLS: security_invoker).
-- ---------------------------------------------------------------------------
create view public.importacion_resumen
with (security_invoker = true)
as
select
  d.id as documento_id,
  d.organizacion_id,
  d.encargo_id,
  d.expediente_id,
  d.nombre_archivo,
  d.sha256,
  d.tamano,
  d.recibido_en,
  d.recibido_por,
  (select count(*) from public.registro r where r.documento_id = d.id) as registros,
  (select count(distinct ev.objeto_id)
     from public.evidencia ev
     join public.registro r on r.id = ev.registro_id
    where r.documento_id = d.id and ev.objeto_tipo = 'entidad') as entidades,
  (select count(distinct ev.objeto_id)
     from public.evidencia ev
     join public.registro r on r.id = ev.registro_id
    where r.documento_id = d.id and ev.objeto_tipo = 'vinculo') as vinculos,
  (select count(distinct ev.objeto_id)
     from public.evidencia ev
     join public.registro r on r.id = ev.registro_id
     join public.evento e on e.id = ev.objeto_id
    where r.documento_id = d.id and ev.objeto_tipo = 'evento' and e.tipo = 'contrato') as contratos,
  (select count(distinct ev.objeto_id)
     from public.evidencia ev
     join public.registro r on r.id = ev.registro_id
     join public.evento e on e.id = ev.objeto_id
    where r.documento_id = d.id and ev.objeto_tipo = 'evento' and e.tipo = 'transferencia') as transferencias,
  (select count(distinct ev.objeto_id)
     from public.evidencia ev
     join public.registro r on r.id = ev.registro_id
     join public.evento e on e.id = ev.objeto_id
    where r.documento_id = d.id and ev.objeto_tipo = 'evento' and e.tipo = 'llamada') as llamadas,
  (select count(*)
     from public.extraccion x
     join public.registro r on r.id = x.registro_id
    where r.documento_id = d.id and x.campo = 'total_declarado') as cifras
from public.documento_origen d
where exists (
  select 1 from public.registro r where r.documento_id = d.id and r.origen = 'importacion'
);

revoke all on public.importacion_resumen from anon;
grant select on public.importacion_resumen to authenticated;
