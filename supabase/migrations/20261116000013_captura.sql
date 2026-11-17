-- Tarea 08 · Migración 13: captura manual.
-- docs/ESPECIFICACION.md §6.

-- ---------------------------------------------------------------------------
-- Campos esperados provisionales del catálogo de §6. Cada elemento:
--   { clave, etiqueta, tipo (texto | texto_largo | fecha | monto | numero), requerido? }
-- Los campos comunes (fecha, referencias, monto, domicilio, teléfono) no se repiten aquí.
-- ---------------------------------------------------------------------------
create function privado.campos_provisionales(p_clave text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_clave
    when 'contrato' then '[
      {"clave":"objeto","etiqueta":"Objeto del contrato","tipo":"texto_largo"},
      {"clave":"tipo_adjudicacion","etiqueta":"Tipo de adjudicación","tipo":"texto"},
      {"clave":"monto_pagado","etiqueta":"Monto pagado","tipo":"monto"},
      {"clave":"fecha_inicio","etiqueta":"Inicio de vigencia","tipo":"fecha"},
      {"clave":"fecha_termino","etiqueta":"Término de vigencia","tipo":"fecha"}]'::jsonb
    when 'convenio_modificatorio' then '[
      {"clave":"contrato_origen","etiqueta":"Contrato que modifica","tipo":"texto"},
      {"clave":"objeto_modificacion","etiqueta":"Qué modifica","tipo":"texto_largo"},
      {"clave":"monto_modificado","etiqueta":"Monto modificado","tipo":"monto"}]'::jsonb
    when 'acta_entrega' then '[
      {"clave":"fecha_entrega","etiqueta":"Fecha de entrega","tipo":"fecha"},
      {"clave":"descripcion","etiqueta":"Qué se entregó","tipo":"texto_largo"}]'::jsonb
    when 'estado_cuenta' then '[
      {"clave":"banco","etiqueta":"Banco","tipo":"texto"},
      {"clave":"periodo_inicio","etiqueta":"Inicio del periodo","tipo":"fecha"},
      {"clave":"periodo_fin","etiqueta":"Fin del periodo","tipo":"fecha"},
      {"clave":"saldo_inicial","etiqueta":"Saldo inicial","tipo":"monto"},
      {"clave":"saldo_final","etiqueta":"Saldo final","tipo":"monto"}]'::jsonb
    when 'comprobante_transferencia' then '[
      {"clave":"banco_origen","etiqueta":"Banco de origen","tipo":"texto"},
      {"clave":"cuenta_origen","etiqueta":"Cuenta de origen","tipo":"texto"},
      {"clave":"banco_destino","etiqueta":"Banco de destino","tipo":"texto"},
      {"clave":"cuenta_destino","etiqueta":"Cuenta de destino","tipo":"texto"},
      {"clave":"referencia","etiqueta":"Referencia o clave de rastreo","tipo":"texto"},
      {"clave":"tipo_operacion","etiqueta":"Tipo de operación","tipo":"texto"}]'::jsonb
    when 'cfdi' then '[
      {"clave":"folio_fiscal","etiqueta":"Folio fiscal (UUID)","tipo":"texto"},
      {"clave":"serie_folio","etiqueta":"Serie y folio","tipo":"texto"},
      {"clave":"concepto","etiqueta":"Concepto","tipo":"texto_largo"},
      {"clave":"subtotal","etiqueta":"Subtotal","tipo":"monto"},
      {"clave":"iva","etiqueta":"IVA","tipo":"monto"}]'::jsonb
    when 'constancia_situacion_fiscal' then '[
      {"clave":"regimen_fiscal","etiqueta":"Régimen fiscal","tipo":"texto"},
      {"clave":"fecha_inicio_operaciones","etiqueta":"Inicio de operaciones","tipo":"fecha"},
      {"clave":"estatus_padron","etiqueta":"Estatus en el padrón","tipo":"texto"}]'::jsonb
    when 'acta_constitutiva' then '[
      {"clave":"escritura_numero","etiqueta":"Número de escritura","tipo":"texto"},
      {"clave":"notario","etiqueta":"Notario","tipo":"texto"},
      {"clave":"notaria_numero","etiqueta":"Número de notaría","tipo":"texto"},
      {"clave":"notaria_estado","etiqueta":"Estado de la notaría","tipo":"texto"},
      {"clave":"objeto_social","etiqueta":"Objeto social","tipo":"texto_largo"},
      {"clave":"registro_publico","etiqueta":"Inscripción en el Registro Público","tipo":"texto"}]'::jsonb
    when 'poder_notarial' then '[
      {"clave":"escritura_numero","etiqueta":"Número de escritura","tipo":"texto"},
      {"clave":"notario","etiqueta":"Notario","tipo":"texto"},
      {"clave":"notaria_numero","etiqueta":"Número de notaría","tipo":"texto"},
      {"clave":"notaria_estado","etiqueta":"Estado de la notaría","tipo":"texto"},
      {"clave":"facultades","etiqueta":"Facultades otorgadas","tipo":"texto_largo"}]'::jsonb
    when 'registro_telefonico' then '[
      {"clave":"numero_origen","etiqueta":"Número de origen","tipo":"texto"},
      {"clave":"numero_destino","etiqueta":"Número de destino","tipo":"texto"},
      {"clave":"duracion_segundos","etiqueta":"Duración (segundos)","tipo":"numero"}]'::jsonb
    when 'oficio' then '[
      {"clave":"numero_oficio","etiqueta":"Número de oficio","tipo":"texto"},
      {"clave":"asunto","etiqueta":"Asunto","tipo":"texto_largo"}]'::jsonb
    when 'otro' then '[
      {"clave":"descripcion","etiqueta":"Descripción","tipo":"texto_largo"}]'::jsonb
    else '[]'::jsonb
  end;
$$;
revoke all on function privado.campos_provisionales(text) from public, anon, authenticated;

-- Tipos ya creados sin campos (catálogo provisional cargado antes de esta tarea).
update public.tipo_documento
   set campos_esperados = privado.campos_provisionales(clave)
 where campos_esperados = '[]'::jsonb;

-- Los tipos nuevos del catálogo provisional nacen con sus campos.
create function privado.tipo_documento_campos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.campos_esperados = '[]'::jsonb then
    new.campos_esperados := privado.campos_provisionales(new.clave);
  end if;
  return new;
end;
$$;
create trigger tipo_documento_campos
  before insert on public.tipo_documento
  for each row execute function privado.tipo_documento_campos();

-- ---------------------------------------------------------------------------
-- capturar_registro: registro de captura con sus datos validados, entidades y,
-- si aplica, el evento. Una sola transacción. Security invoker: RLS decide.
--   p = { encargo_id, tipo_documento_id, expediente_id, fuente, fecha_documento, resumen,
--         campos: [{ campo, valor_crudo, valor_normalizado }],
--         involucrados: [{ tipo, nombre, nombre_normalizado, rol, identificadores }],
--         evento: null | { tipo, fecha_hora, monto, moneda, atributos,
--                          participantes: [{ indice, rol }] } }
-- ---------------------------------------------------------------------------
create function public.capturar_registro(p jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_enc uuid := (p ->> 'encargo_id')::uuid;
  v_org uuid;
  v_fuente text := nullif(trim(coalesce(p ->> 'fuente', '')), '');
  v_reg uuid;
  v_i jsonb;
  v_n int := 0;
  v_ent uuid;
  v_rfc text;
  v_entidades uuid[] := '{}';
  v_evento uuid;
begin
  select organizacion_id into v_org from public.encargo where id = v_enc;
  if not found then
    raise exception 'encargo inexistente' using errcode = 'P0002';
  end if;
  if v_fuente is null then
    raise exception 'la fuente declarada es obligatoria' using errcode = '22023';
  end if;

  insert into public.registro
    (organizacion_id, encargo_id, expediente_id, tipo_documento_id, origen, fuente, fecha_documento,
     estado_validacion, resumen)
  values
    (v_org, v_enc, nullif(p ->> 'expediente_id', '')::uuid, (p ->> 'tipo_documento_id')::uuid, 'captura',
     v_fuente, nullif(p ->> 'fecha_documento', '')::date, 'validado', left(p ->> 'resumen', 255))
  returning id into v_reg;

  -- §6: la captura es una extracción validada por quien la hace, sin confianza.
  insert into public.extraccion
    (organizacion_id, encargo_id, registro_id, campo, valor_crudo, valor_normalizado, metodo, estado,
     validado_por, validado_en)
  select v_org, v_enc, v_reg, c ->> 'campo', c ->> 'valor_crudo', c -> 'valor_normalizado', 'manual',
         'validado', (select auth.uid()), now()
    from jsonb_array_elements(coalesce(p -> 'campos', '[]'::jsonb)) c;

  for v_i in select * from jsonb_array_elements(coalesce(p -> 'involucrados', '[]'::jsonb)) loop
    v_n := v_n + 1;
    v_ent := null;
    v_rfc := case when coalesce(v_i -> 'identificadores' -> 'invalidos', '[]'::jsonb) ? 'rfc' then null
                  else nullif(v_i -> 'identificadores' ->> 'rfc', '') end;

    -- Misma entidad: mismo RFC válido, o mismo tipo y nombre sin RFC que lo contradiga.
    if v_rfc is not null then
      select coalesce(e.fusionada_en, e.id) into v_ent
        from public.entidad e
       where e.encargo_id = v_enc and e.identificadores ->> 'rfc' = v_rfc
         and not coalesce(e.identificadores -> 'invalidos', '[]'::jsonb) ? 'rfc'
       order by e.creado_en limit 1;
    end if;
    if v_ent is null then
      select coalesce(e.fusionada_en, e.id) into v_ent
        from public.entidad e
       where e.encargo_id = v_enc and e.tipo = v_i ->> 'tipo'
         and e.nombre_normalizado = v_i ->> 'nombre_normalizado'
         and (v_rfc is null or e.identificadores ->> 'rfc' is null or e.identificadores ->> 'rfc' = v_rfc)
       order by e.creado_en limit 1;
    end if;

    if v_ent is null then
      insert into public.entidad (organizacion_id, encargo_id, tipo, nombre, nombre_normalizado, identificadores)
      values (v_org, v_enc, v_i ->> 'tipo', v_i ->> 'nombre', v_i ->> 'nombre_normalizado',
              coalesce(v_i -> 'identificadores', '{}'::jsonb))
      returning id into v_ent;
    else
      -- Lo ya conocido manda; la captura solo agrega identificadores que faltaban.
      update public.entidad e
         set identificadores = coalesce(v_i -> 'identificadores', '{}'::jsonb) || e.identificadores
       where e.id = v_ent
         and not (e.identificadores @> (coalesce(v_i -> 'identificadores', '{}'::jsonb) - 'invalidos'));
    end if;
    v_entidades := v_entidades || v_ent;

    insert into public.registro_entidad (organizacion_id, encargo_id, registro_id, entidad_id, rol)
    values (v_org, v_enc, v_reg, v_ent, v_i ->> 'rol')
    on conflict (registro_id, entidad_id, rol) do nothing;

    insert into public.evidencia (organizacion_id, encargo_id, objeto_tipo, objeto_id, registro_id, extraccion_id)
    select v_org, v_enc, 'entidad', v_ent, v_reg,
           (select x.id from public.extraccion x
             where x.registro_id = v_reg and x.campo = 'involucrado_' || v_n limit 1)
     where not exists (select 1 from public.evidencia ev
                        where ev.objeto_tipo = 'entidad' and ev.objeto_id = v_ent and ev.registro_id = v_reg);
  end loop;

  if jsonb_typeof(p -> 'evento') = 'object' then
    insert into public.evento (organizacion_id, encargo_id, tipo, fecha_hora, monto, moneda, atributos)
    values (v_org, v_enc, p -> 'evento' ->> 'tipo', nullif(p -> 'evento' ->> 'fecha_hora', '')::timestamptz,
            nullif(p -> 'evento' ->> 'monto', '')::numeric, nullif(p -> 'evento' ->> 'moneda', ''),
            coalesce(p -> 'evento' -> 'atributos', '{}'::jsonb))
    returning id into v_evento;

    insert into public.evento_participante (organizacion_id, encargo_id, evento_id, entidad_id, rol)
    select distinct on (v_entidades[(x ->> 'indice')::int + 1], x ->> 'rol')
           v_org, v_enc, v_evento, v_entidades[(x ->> 'indice')::int + 1], x ->> 'rol'
      from jsonb_array_elements(coalesce(p -> 'evento' -> 'participantes', '[]'::jsonb)) x
     where v_entidades[(x ->> 'indice')::int + 1] is not null;

    insert into public.evidencia (organizacion_id, encargo_id, objeto_tipo, objeto_id, registro_id)
    values (v_org, v_enc, 'evento', v_evento, v_reg);
  end if;

  return v_reg;
end;
$$;
revoke all on function public.capturar_registro(jsonb) from public, anon;
grant execute on function public.capturar_registro(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- asociar_documento: liga un original ya subido y verificado a una captura sin
-- soporte y encola su extracción (la comparación campo por campo llega en la tarea 09).
--   p = { registro_id, sha256, nombre_archivo, mime, tamano }
-- ---------------------------------------------------------------------------
create function public.asociar_documento(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.registro;
  v_sha text := p ->> 'sha256';
  v_ruta text;
  v_doc uuid;
  v_trabajo uuid;
begin
  select * into r from public.registro where id = (p ->> 'registro_id')::uuid;
  if not found then
    raise exception 'registro inexistente' using errcode = 'P0002';
  end if;
  if r.origen <> 'captura' or r.documento_id is not null then
    raise exception 'el registro ya tiene soporte documental' using errcode = '22023';
  end if;

  v_ruta := r.organizacion_id::text || '/' || r.encargo_id::text || '/' || v_sha;
  if not exists (select 1 from storage.objects o where o.bucket_id = 'originales' and o.name = v_ruta) then
    raise exception 'el original no está en el almacenamiento' using errcode = 'P0002';
  end if;

  insert into public.documento_origen
    (organizacion_id, encargo_id, expediente_id, sha256, storage_path, nombre_archivo, mime, tamano, fuente)
  values
    (r.organizacion_id, r.encargo_id, r.expediente_id, v_sha, v_ruta, left(p ->> 'nombre_archivo', 255),
     p ->> 'mime', (p ->> 'tamano')::bigint, r.fuente)
  returning id into v_doc;

  update public.registro
     set documento_id = v_doc, estado_extraccion = 'en_cola'
   where id = r.id and documento_id is null;
  if not found then
    raise exception 'sin permiso para modificar el registro' using errcode = '42501';
  end if;

  insert into public.trabajo (organizacion_id, encargo_id, tipo, payload)
  values (r.organizacion_id, r.encargo_id, 'extraccion',
          jsonb_build_object('registro_id', r.id, 'documento_id', v_doc, 'comparar_con_captura', true))
  returning id into v_trabajo;

  return jsonb_build_object('documento_id', v_doc, 'registro_id', r.id, 'trabajo_id', v_trabajo);
end;
$$;
revoke all on function public.asociar_documento(jsonb) from public, anon;
grant execute on function public.asociar_documento(jsonb) to authenticated;
