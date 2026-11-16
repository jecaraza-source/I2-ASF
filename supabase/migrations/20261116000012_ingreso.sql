-- Tarea 07 · Migración 12: ingreso de documentos y procesador de trabajos.
-- docs/ESPECIFICACION.md §4, §6.

-- ---------------------------------------------------------------------------
-- registro.estado_extraccion: en qué punto va la extracción del documento.
-- ---------------------------------------------------------------------------
alter table public.registro
  add column estado_extraccion text not null default 'no_aplica'
    check (estado_extraccion in ('no_aplica', 'en_cola', 'en_espera', 'en_proceso', 'hecha', 'error'));

comment on column public.registro.estado_extraccion is
  'no_aplica: captura o importación. en_cola: trabajo creado. en_espera: listo para extraer (la IA llega en la tarea 09).';

-- ---------------------------------------------------------------------------
-- registrar_documento: documento_origen + registro pendiente + trabajo de
-- extracción en una sola transacción. Security invoker: RLS decide.
--   p = { encargo_id, sha256, nombre_archivo, mime, tamano, tipo_documento_id, fuente,
--         expediente_id | expediente_nuevo }
-- El sha256 lo calcula el servidor a partir del objeto ya subido (§4).
-- ---------------------------------------------------------------------------
create function public.registrar_documento(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_enc uuid := (p ->> 'encargo_id')::uuid;
  v_org uuid;
  v_sha text := p ->> 'sha256';
  v_ruta text;
  v_exp uuid := nullif(p ->> 'expediente_id', '')::uuid;
  v_exp_nuevo text := nullif(trim(coalesce(p ->> 'expediente_nuevo', '')), '');
  v_fuente text := nullif(trim(coalesce(p ->> 'fuente', '')), '');
  v_doc uuid;
  v_reg uuid;
  v_trabajo uuid;
begin
  select organizacion_id into v_org from public.encargo where id = v_enc;
  if not found then
    raise exception 'encargo inexistente' using errcode = 'P0002';
  end if;
  if v_fuente is null then
    raise exception 'la fuente es obligatoria' using errcode = '22023';
  end if;
  if (p ->> 'tipo_documento_id') is null then
    raise exception 'el tipo de documento es obligatorio' using errcode = '22023';
  end if;

  v_ruta := v_org::text || '/' || v_enc::text || '/' || v_sha;
  -- Regla 2: sin original en el bucket no hay documento.
  if not exists (select 1 from storage.objects o where o.bucket_id = 'originales' and o.name = v_ruta) then
    raise exception 'el original no está en el almacenamiento' using errcode = 'P0002';
  end if;

  if v_exp is null and v_exp_nuevo is not null then
    select id into v_exp from public.expediente where encargo_id = v_enc and identificador = v_exp_nuevo;
    if not found then
      insert into public.expediente (organizacion_id, encargo_id, identificador)
      values (v_org, v_enc, v_exp_nuevo)
      returning id into v_exp;
    end if;
  end if;
  if v_exp is null then
    raise exception 'el expediente es obligatorio' using errcode = '22023';
  end if;

  insert into public.documento_origen
    (organizacion_id, encargo_id, expediente_id, sha256, storage_path, nombre_archivo, mime, tamano, fuente)
  values
    (v_org, v_enc, v_exp, v_sha, v_ruta, left(p ->> 'nombre_archivo', 255), p ->> 'mime',
     (p ->> 'tamano')::bigint, v_fuente)
  returning id into v_doc;

  insert into public.registro
    (organizacion_id, encargo_id, expediente_id, tipo_documento_id, origen, documento_id, fuente,
     estado_validacion, resumen, estado_extraccion)
  values
    (v_org, v_enc, v_exp, (p ->> 'tipo_documento_id')::uuid, 'documento', v_doc, v_fuente,
     'pendiente', left(p ->> 'nombre_archivo', 255), 'en_cola')
  returning id into v_reg;

  insert into public.trabajo (organizacion_id, encargo_id, tipo, payload)
  values (v_org, v_enc, 'extraccion', jsonb_build_object('registro_id', v_reg, 'documento_id', v_doc))
  returning id into v_trabajo;

  return jsonb_build_object('documento_id', v_doc, 'registro_id', v_reg, 'trabajo_id', v_trabajo,
                            'expediente_id', v_exp);
end;
$$;
revoke all on function public.registrar_documento(jsonb) from public, anon;
grant execute on function public.registrar_documento(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Procesador de trabajos (solo service_role, desde /api/trabajos/procesar).
-- tomar_trabajos: toma pendientes vencidos con bloqueo (for update skip locked) y
-- los deja en_proceso por 5 minutos; si el proceso muere, vuelven a tomarse.
-- ---------------------------------------------------------------------------
create function public.tomar_trabajos(p_limite int default 10, p_trabajo uuid default null)
returns setof public.trabajo
language sql
security invoker
set search_path = ''
as $$
  update public.trabajo t
     set estado = 'en_proceso', intentos = t.intentos + 1, bloqueado_hasta = now() + interval '5 minutes'
   where t.id in (
     select c.id
       from public.trabajo c
      where (p_trabajo is null or c.id = p_trabajo)
        and ((c.estado = 'pendiente' and (c.bloqueado_hasta is null or c.bloqueado_hasta <= now()))
          or (c.estado = 'en_proceso' and c.bloqueado_hasta <= now()))
      order by c.creado_en
      limit greatest(1, least(coalesce(p_limite, 10), 100))
      for update skip locked
   )
  returning t.*;
$$;
revoke all on function public.tomar_trabajos(int, uuid) from public, anon, authenticated;
grant execute on function public.tomar_trabajos(int, uuid) to service_role;

-- terminar_trabajo: hecho, o reintento con espera creciente (2, 4, 8… minutos); al tercer
-- fallo queda en error. Solo actúa sobre trabajos en_proceso (idempotente).
create function public.terminar_trabajo(p_trabajo uuid, p_ok boolean, p_error text default null)
returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  t public.trabajo;
  v_estado text;
begin
  select * into t from public.trabajo where id = p_trabajo and estado = 'en_proceso' for update;
  if not found then
    return null;
  end if;
  if p_ok then
    v_estado := 'hecho';
  elsif t.intentos >= 3 then
    v_estado := 'error';
  else
    v_estado := 'pendiente';
  end if;
  update public.trabajo
     set estado = v_estado,
         error = case when p_ok then null else left(coalesce(p_error, 'error'), 200) end,
         bloqueado_hasta = case when v_estado = 'pendiente'
                                then now() + make_interval(mins => (2 ^ t.intentos)::int) end
   where id = p_trabajo;
  return v_estado;
end;
$$;
revoke all on function public.terminar_trabajo(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.terminar_trabajo(uuid, boolean, text) to service_role;
