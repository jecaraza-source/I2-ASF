-- Tarea 09 (motor) · Migración 15: extracción con IA, respaldo entre proveedores y reencolado.
-- docs/ESPECIFICACION.md §7 y §7.1.

-- ---------------------------------------------------------------------------
-- Tope propio por proveedor: al agotarse el del principal, el procesador pasa al de respaldo.
-- ---------------------------------------------------------------------------
create table public.tope_proveedor_ia (
  organizacion_id uuid not null references public.organizacion (id),
  proveedor text not null check (proveedor in ('anthropic', 'openai')),
  tope_diario_tokens bigint check (tope_diario_tokens >= 0),
  tope_mensual_tokens bigint check (tope_mensual_tokens >= 0),
  actualizado_en timestamptz not null default now(),
  creado_en timestamptz not null default now(),
  creado_por uuid references auth.users (id) on delete set null default auth.uid(),
  primary key (organizacion_id, proveedor)
);
create index tope_proveedor_ia_creado_por_idx on public.tope_proveedor_ia (creado_por);
select privado.aplicar_rls('public.tope_proveedor_ia', '{admin}', true, false);

create function public.guardar_tope_proveedor_ia(
  p_organizacion uuid, p_proveedor text, p_tope_diario bigint, p_tope_mensual bigint)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.tope_proveedor_ia (organizacion_id, proveedor, tope_diario_tokens, tope_mensual_tokens)
  values (p_organizacion, p_proveedor, p_tope_diario, p_tope_mensual)
  on conflict (organizacion_id, proveedor) do update
    set tope_diario_tokens = excluded.tope_diario_tokens,
        tope_mensual_tokens = excluded.tope_mensual_tokens, actualizado_en = now();
  insert into public.bitacora (organizacion_id, actor, accion, objeto_tipo, objeto_id, detalle)
  values (p_organizacion, (select auth.uid()), 'ia.tope_proveedor', 'organizacion', p_organizacion,
          jsonb_build_object('proveedor', p_proveedor, 'tope_diario_tokens', p_tope_diario,
                             'tope_mensual_tokens', p_tope_mensual));
end;
$$;
revoke all on function public.guardar_tope_proveedor_ia(uuid, text, bigint, bigint) from public, anon;
grant execute on function public.guardar_tope_proveedor_ia(uuid, text, bigint, bigint) to authenticated;

-- ia_permitida: ahora también revisa el tope del proveedor.
create or replace function public.ia_permitida(p_encargo uuid, p_proveedor text)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  e public.encargo;
  c public.configuracion_ia;
  t public.tope_proveedor_ia;
  v_hoy bigint;
  v_mes bigint;
  v_hoy_p bigint;
  v_mes_p bigint;
  v_dia timestamptz := date_trunc('day', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City';
  v_inicio_mes timestamptz := date_trunc('month', now() at time zone 'America/Mexico_City') at time zone 'America/Mexico_City';
  v_motivo text;
begin
  select * into e from public.encargo where id = p_encargo;
  if not found then
    return jsonb_build_object('permitida', false, 'motivo', 'encargo_inexistente');
  end if;
  select * into c from public.configuracion_ia where organizacion_id = e.organizacion_id;
  select * into t from public.tope_proveedor_ia
   where organizacion_id = e.organizacion_id and proveedor = p_proveedor;
  select k.hoy, k.mes into v_hoy, v_mes from privado.consumo_ia(e.organizacion_id) k;
  select coalesce(sum(tokens_entrada + tokens_salida) filter (where creado_en >= v_dia), 0),
         coalesce(sum(tokens_entrada + tokens_salida), 0)
    into v_hoy_p, v_mes_p
    from public.uso_ia
   where organizacion_id = e.organizacion_id and proveedor = p_proveedor and creado_en >= v_inicio_mes;

  if c.organizacion_id is not null and not c.activa then
    v_motivo := 'ia_apagada_organizacion';
  elsif not (p_proveedor = any (e.ia_proveedores)) then
    v_motivo := 'proveedor_no_permitido_en_encargo';
  elsif v_hoy >= coalesce(c.tope_diario_tokens, 2000000) then
    v_motivo := 'tope_diario';
  elsif v_mes >= coalesce(c.tope_mensual_tokens, 30000000) then
    v_motivo := 'tope_mensual';
  elsif t.tope_diario_tokens is not null and v_hoy_p >= t.tope_diario_tokens then
    v_motivo := 'tope_proveedor_diario';
  elsif t.tope_mensual_tokens is not null and v_mes_p >= t.tope_mensual_tokens then
    v_motivo := 'tope_proveedor_mensual';
  end if;
  return jsonb_build_object('permitida', v_motivo is null, 'motivo', v_motivo,
                            'organizacion_id', e.organizacion_id);
end;
$$;

-- ---------------------------------------------------------------------------
-- registro.extraccion_nota: por qué un documento espera o falló (código corto, sin contenido).
-- ---------------------------------------------------------------------------
alter table public.registro
  add column extraccion_nota text check (extraccion_nota is null or extraccion_nota ~ '^[a-z0-9_.:-]{1,80}$');

-- ---------------------------------------------------------------------------
-- guardar_extraccion_ia: lo que leyó el modelo, en una transacción (solo el procesador).
--   p = { registro_id, proveedor, modelo, fecha_documento,
--         extracciones: [{ campo, valor_crudo, valor_normalizado, confianza, ubicacion, estado }] }
-- Regla 4: lo que alcanzó el umbral queda `validado` con validado_por nulo (automático); lo demás,
-- `pendiente`. Nada de esto crea entidades todavía: eso ocurre al validar el registro.
-- Idempotente: si el registro ya tiene su extracción, no hace nada.
-- ---------------------------------------------------------------------------
create function public.guardar_extraccion_ia(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.registro;
  v_total int;
  v_pendientes int;
begin
  select * into r from public.registro where id = (p ->> 'registro_id')::uuid for update;
  if not found then
    raise exception 'registro inexistente' using errcode = 'P0002';
  end if;
  if r.estado_extraccion = 'hecha' then
    return jsonb_build_object('repetida', true);
  end if;

  insert into public.extraccion
    (organizacion_id, encargo_id, registro_id, campo, valor_crudo, valor_normalizado, confianza,
     ubicacion, metodo, estado, validado_en, creado_por)
  select r.organizacion_id, r.encargo_id, r.id, x ->> 'campo', x ->> 'valor_crudo', x -> 'valor_normalizado',
         (x ->> 'confianza')::numeric, coalesce(x -> 'ubicacion', '{}'::jsonb), 'ia',
         case when x ->> 'estado' = 'validado' then 'validado' else 'pendiente' end,
         case when x ->> 'estado' = 'validado' then now() end, null
    from jsonb_array_elements(coalesce(p -> 'extracciones', '[]'::jsonb)) x;
  get diagnostics v_total = row_count;
  select count(*) into v_pendientes
    from jsonb_array_elements(coalesce(p -> 'extracciones', '[]'::jsonb)) x
   where x ->> 'estado' <> 'validado';

  update public.registro
     set estado_extraccion = 'hecha',
         extraccion_nota = left(p ->> 'proveedor', 80),
         fecha_documento = coalesce(fecha_documento, nullif(p ->> 'fecha_documento', '')::date)
   where id = r.id;

  insert into public.bitacora (organizacion_id, encargo_id, actor, accion, objeto_tipo, objeto_id, detalle)
  values (r.organizacion_id, r.encargo_id, null, 'extraccion.ia', 'registro', r.id,
          jsonb_build_object('proveedor', p ->> 'proveedor', 'modelo', p ->> 'modelo',
                             'extracciones', v_total, 'pendientes', v_pendientes));
  return jsonb_build_object('extracciones', v_total, 'pendientes', v_pendientes);
end;
$$;
revoke all on function public.guardar_extraccion_ia(jsonb) from public, anon, authenticated;
grant execute on function public.guardar_extraccion_ia(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Reencolar: un documento que quedó en espera (IA apagada, tope) o con error vuelve a la cola.
-- Security invoker: RLS decide (admin y auditor).
-- ---------------------------------------------------------------------------
create function public.encolar_extraccion(p_registro uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r public.registro;
  v_trabajo uuid;
begin
  select * into r from public.registro where id = p_registro;
  if not found then
    raise exception 'registro inexistente' using errcode = 'P0002';
  end if;
  if r.documento_id is null or r.estado_extraccion not in ('en_espera', 'error') then
    raise exception 'el registro no está en espera de extracción' using errcode = '22023';
  end if;
  update public.registro set estado_extraccion = 'en_cola', extraccion_nota = null
   where id = r.id and estado_extraccion in ('en_espera', 'error');
  if not found then
    raise exception 'sin permiso para reencolar' using errcode = '42501';
  end if;
  insert into public.trabajo (organizacion_id, encargo_id, tipo, payload)
  values (r.organizacion_id, r.encargo_id, 'extraccion',
          jsonb_build_object('registro_id', r.id, 'documento_id', r.documento_id,
                             'comparar_con_captura', r.origen = 'captura'))
  returning id into v_trabajo;
  return v_trabajo;
end;
$$;
revoke all on function public.encolar_extraccion(uuid) from public, anon;
grant execute on function public.encolar_extraccion(uuid) to authenticated;

create function public.encolar_extracciones_en_espera(p_encargo uuid)
returns int
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_n int := 0;
begin
  for v_id in
    select id from public.registro
     where encargo_id = p_encargo and documento_id is not null and estado_extraccion = 'en_espera'
     order by creado_en limit 500
  loop
    perform public.encolar_extraccion(v_id);
    v_n := v_n + 1;
  end loop;
  return v_n;
end;
$$;
revoke all on function public.encolar_extracciones_en_espera(uuid) from public, anon;
grant execute on function public.encolar_extracciones_en_espera(uuid) to authenticated;
