-- Tarea 06 · Migración 10: ejecución de reglas y resolución de alertas.
-- docs/ESPECIFICACION.md §10.

-- ---------------------------------------------------------------------------
-- alerta: identidad estable, vigencia y resolución con motivo.
-- ---------------------------------------------------------------------------
alter table public.alerta
  add column huella text check (huella is null or length(huella) between 3 and 2000),
  add column vigente boolean not null default true,
  add column resolucion_motivo text,
  add column resuelta_en timestamptz,
  -- Confirmar o descartar exige un motivo (regla 4: el auditor dispone y lo deja escrito).
  add constraint alerta_resolucion_con_motivo
    check (estado = 'abierta' or length(trim(coalesce(resolucion_motivo, ''))) >= 3);

comment on column public.alerta.huella is
  'Identidad de la alerta (regla + evidencias). Volver a ejecutar las reglas no la duplica.';
comment on column public.alerta.vigente is
  'false cuando la última ejecución de su regla ya no la reprodujo. No cambia el estado.';

-- Una alerta por huella y encargo: reejecutar no duplica ni reabre las resueltas.
create unique index alerta_huella_idx on public.alerta (encargo_id, md5(huella)) where huella is not null;
create unique index evidencia_alerta_unica_idx
  on public.evidencia (objeto_id, registro_id, coalesce(extraccion_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where objeto_tipo = 'alerta';

-- ---------------------------------------------------------------------------
-- guardar_alertas: guarda el resultado de una ejecución de reglas en una sola
-- transacción. Security invoker: RLS decide (lector no puede).
--   p = { encargo_id, reglas: ["R01", …], alertas: [{ regla, severidad, huella, detalle,
--         evidencias: [{ registro_id, extraccion_id }] }] }
-- ---------------------------------------------------------------------------
create function public.guardar_alertas(p jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_enc uuid := (p ->> 'encargo_id')::uuid;
  v_org uuid;
  v_a jsonb;
  v_id uuid;
  v_nuevas int := 0;
  v_reproducidas int := 0;
  v_no_vigentes int := 0;
  v_reglas text[] := array(select jsonb_array_elements_text(coalesce(p -> 'reglas', '[]'::jsonb)));
  v_huellas text[] := array(
    select a ->> 'huella' from jsonb_array_elements(coalesce(p -> 'alertas', '[]'::jsonb)) a
  );
begin
  select organizacion_id into v_org from public.encargo where id = v_enc;
  if not found then
    raise exception 'encargo inexistente' using errcode = 'P0002';
  end if;

  for v_a in select * from jsonb_array_elements(coalesce(p -> 'alertas', '[]'::jsonb)) loop
    select id into v_id from public.alerta
     where encargo_id = v_enc and md5(huella) = md5(v_a ->> 'huella') and huella = v_a ->> 'huella';
    if found then
      -- Solo las abiertas se refrescan; una alerta resuelta conserva lo que vio el auditor.
      update public.alerta
         set severidad = v_a ->> 'severidad', detalle = coalesce(v_a -> 'detalle', '{}'::jsonb), vigente = true
       where id = v_id and estado = 'abierta';
      v_reproducidas := v_reproducidas + 1;
    else
      insert into public.alerta (organizacion_id, encargo_id, regla, severidad, huella, detalle)
      values (v_org, v_enc, v_a ->> 'regla', v_a ->> 'severidad', v_a ->> 'huella',
              coalesce(v_a -> 'detalle', '{}'::jsonb))
      returning id into v_id;
      v_nuevas := v_nuevas + 1;
    end if;

    -- Regla 1: cada alerta apunta a los registros que se contradicen.
    insert into public.evidencia (organizacion_id, encargo_id, objeto_tipo, objeto_id, registro_id, extraccion_id)
    select distinct v_org, v_enc, 'alerta', v_id, (e ->> 'registro_id')::uuid,
           nullif(e ->> 'extraccion_id', '')::uuid
      from jsonb_array_elements(coalesce(v_a -> 'evidencias', '[]'::jsonb)) e
    on conflict do nothing;
  end loop;

  -- Alertas abiertas de las reglas ejecutadas que ya no se reproducen.
  update public.alerta
     set vigente = false
   where encargo_id = v_enc and estado = 'abierta' and vigente
     and regla = any (v_reglas) and huella is not null and not (huella = any (v_huellas));
  get diagnostics v_no_vigentes = row_count;

  insert into public.bitacora (organizacion_id, encargo_id, actor, accion, objeto_tipo, objeto_id, detalle)
  values (
    v_org, v_enc, (select auth.uid()), 'reglas.ejecutadas', 'encargo', v_enc,
    jsonb_build_object('reglas', to_jsonb(v_reglas), 'nuevas', v_nuevas,
                       'reproducidas', v_reproducidas, 'no_vigentes', v_no_vigentes)
  );
  return jsonb_build_object('nuevas', v_nuevas, 'reproducidas', v_reproducidas, 'no_vigentes', v_no_vigentes);
end;
$$;
revoke all on function public.guardar_alertas(jsonb) from public, anon;
grant execute on function public.guardar_alertas(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- resolver_alerta: confirmar o descartar con motivo. La bitácora la escribe el
-- disparador alerta_bitacora_resolucion.
-- ---------------------------------------------------------------------------
create function public.resolver_alerta(p_alerta uuid, p_estado text, p_motivo text)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_estado text;
begin
  if p_estado not in ('confirmada', 'descartada') then
    raise exception 'estado inválido' using errcode = '22023';
  end if;
  if length(trim(coalesce(p_motivo, ''))) < 3 then
    raise exception 'el motivo es obligatorio' using errcode = '22023';
  end if;
  select estado into v_estado from public.alerta where id = p_alerta;
  if not found then
    raise exception 'alerta inexistente' using errcode = 'P0002';
  end if;
  if v_estado <> 'abierta' then
    raise exception 'la alerta ya fue resuelta' using errcode = '22023';
  end if;

  update public.alerta
     set estado = p_estado, resolucion_motivo = trim(p_motivo),
         resuelta_por = (select auth.uid()), resuelta_en = now()
   where id = p_alerta and estado = 'abierta';
  if not found then
    -- RLS oculta la fila a quien no puede actualizarla (lector).
    raise exception 'sin permiso para resolver la alerta' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public.resolver_alerta(uuid, text, text) from public, anon;
grant execute on function public.resolver_alerta(uuid, text, text) to authenticated;
