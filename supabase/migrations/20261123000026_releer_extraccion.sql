-- Tarea 20 · Migración 26: volver a leer con IA un documento que aún no se valida.
--
--  * `extraccion.estado` admite `reemplazado`: la lectura anterior de la IA no se borra (trazabilidad),
--    pero deja de contar. Como todo lo que alimenta entidades, red y reglas usa `validado`/`corregido`,
--    una lectura reemplazada queda fuera sin tocar esas consultas.
--  * `validar_registro` y `rechazar_registro` ignoran las lecturas reemplazadas.
--  * `releer_extraccion(registro)`: solo documentos leídos (`hecha`) y pendientes de validar. Marca
--    las lecturas de la IA como reemplazadas, regresa el documento a la cola y deja constancia.
--    Security invoker: RLS decide (admin y auditor).

alter table public.extraccion drop constraint extraccion_estado_check;
alter table public.extraccion add constraint extraccion_estado_check
  check (estado in ('pendiente', 'validado', 'corregido', 'rechazado', 'reemplazado'));

CREATE OR REPLACE FUNCTION public.validar_registro(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
   where x.registro_id = r.id and x.metodo = 'ia' and x.estado <> 'reemplazado';

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
   where x.id = d.id and x.registro_id = r.id and x.metodo = 'ia' and x.estado <> 'reemplazado';
  get diagnostics v_decididas = row_count;
  if v_decididas <> v_lecturas
     or v_decididas <> jsonb_array_length(coalesce(p -> 'decisiones', '[]'::jsonb)) then
    raise exception 'decisiones_incompletas: cada lectura de la IA necesita una decisión'
      using errcode = '22023';
  end if;
  select count(*) filter (where x.estado = 'corregido'), count(*) filter (where x.estado = 'rechazado')
    into v_corregidas, v_rechazadas
    from public.extraccion x where x.registro_id = r.id and x.metodo = 'ia' and x.estado <> 'reemplazado';

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
$function$

;

CREATE OR REPLACE FUNCTION public.rechazar_registro(p_registro uuid, p_motivo text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
   where registro_id = r.id and metodo = 'ia' and estado <> 'reemplazado';
  update public.registro set estado_validacion = 'rechazado' where id = r.id;
  if not found then
    raise exception 'sin permiso para rechazar' using errcode = '42501';
  end if;
  insert into public.bitacora (organizacion_id, encargo_id, actor, accion, objeto_tipo, objeto_id, detalle)
  values (r.organizacion_id, r.encargo_id, v_actor, 'registro.rechazo', 'registro', r.id,
          jsonb_build_object('motivo', left(v_motivo, 500)));
end;
$function$

;

create function public.releer_extraccion(p_registro uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.registro;
  v_trabajo uuid;
  v_reemplazadas int;
begin
  select * into r from public.registro where id = p_registro for update;
  if not found then
    raise exception 'registro inexistente' using errcode = 'P0002';
  end if;
  if r.origen <> 'documento' or r.documento_id is null
     or r.estado_extraccion <> 'hecha' or r.estado_validacion <> 'pendiente' then
    raise exception 'no_releible: solo se vuelve a leer un documento leído y sin validar'
      using errcode = '22023';
  end if;

  -- Primero el registro: si RLS no deja actualizarlo, no se toca ninguna lectura.
  update public.registro set estado_extraccion = 'en_cola', extraccion_nota = null
   where id = r.id and estado_extraccion = 'hecha';
  if not found then
    raise exception 'sin permiso para volver a leer' using errcode = '42501';
  end if;

  update public.extraccion
     set estado = 'reemplazado'
   where registro_id = r.id and metodo = 'ia' and estado <> 'reemplazado';
  get diagnostics v_reemplazadas = row_count;

  insert into public.trabajo (organizacion_id, encargo_id, tipo, payload)
  values (r.organizacion_id, r.encargo_id, 'extraccion',
          jsonb_build_object('registro_id', r.id, 'documento_id', r.documento_id,
                             'comparar_con_captura', false))
  returning id into v_trabajo;

  insert into public.bitacora (organizacion_id, encargo_id, actor, accion, objeto_tipo, objeto_id, detalle)
  values (r.organizacion_id, r.encargo_id, (select auth.uid()), 'extraccion.releer', 'registro', r.id,
          jsonb_build_object('reemplazadas', v_reemplazadas, 'trabajo_id', v_trabajo));
  return v_trabajo;
end;
$$;
revoke all on function public.releer_extraccion(uuid) from public, anon;
grant execute on function public.releer_extraccion(uuid) to authenticated;
