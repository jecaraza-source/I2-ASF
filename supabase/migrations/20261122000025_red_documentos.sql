-- Tarea 19 · Migración 25: vínculos que salen de los documentos validados.
-- docs/ESPECIFICACION.md §9.
--
-- Hasta ahora los vínculos solo nacían de los Excel importados: un acta o un poder validado ponía a
-- sus personas en la red, pero sueltas. Ahora cada involucrado de un documento se une con la
-- sociedad según su papel (socio con su aportación y su participación, comisario, apoderado,
-- representante legal, administrador y notario). Cada vínculo apunta a su registro y a la lectura
-- del involucrado (regla 1).

-- ---------------------------------------------------------------------------
-- 1. Columnas del vínculo
-- ---------------------------------------------------------------------------
alter table public.vinculo
  add column monto numeric(18, 2),
  add column moneda text check (moneda ~ '^[A-Z]{3}$'),
  add column participacion numeric(6, 5) check (participacion > 0 and participacion <= 1),
  add column registro_id uuid,
  add constraint vinculo_monto_moneda check ((monto is null) = (moneda is null)),
  add constraint vinculo_registro_fk foreign key (encargo_id, registro_id)
    references public.registro (encargo_id, id);

comment on column public.vinculo.registro_id is
  'Documento del que se derivó el vínculo (tarea 19); null en los declarados por importación.';
comment on column public.vinculo.participacion is
  'Fracción del capital social (aportación / capital del documento), solo socios.';

create index vinculo_registro_idx on public.vinculo (encargo_id, registro_id);
-- Un vínculo por persona, sociedad y papel en cada documento: volver a derivarlo no lo duplica.
create unique index vinculo_documento_unico on public.vinculo (registro_id, origen_id, destino_id, tipo)
  where registro_id is not null;

-- ---------------------------------------------------------------------------
-- 2. Derivación
-- ---------------------------------------------------------------------------
-- Papeles que unen a una persona con la sociedad del documento, y su fuerza (1–10) por omisión.
create function privado.fuerza_papel(p_rol text)
returns smallint
language sql
immutable
set search_path = ''
as $$
  select case p_rol
    when 'socio' then 5
    when 'representante_legal' then 7
    when 'apoderado' then 6
    when 'administrador' then 7
    when 'comisario' then 4
    when 'notario' then 2
  end::smallint;
$$;
revoke all on function privado.fuerza_papel(text) from public, anon, authenticated;

create function privado.vinculos_de_documento(p_encargo uuid, p_registro uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_principal uuid;
  v_capital numeric;
  v_m record;
  v_x record;
  v_monto numeric(18, 2);
  v_moneda text;
  v_part numeric;
  v_fuerza smallint;
  v_id uuid;
  v_nuevos integer := 0;
begin
  select r.organizacion_id into v_org
    from public.registro r
   where r.encargo_id = p_encargo and r.id = p_registro and r.estado_validacion in ('validado', 'corregido');
  if v_org is null then
    return 0;
  end if;

  -- La sociedad del documento: la empresa con rol «titular»; si no hay, la única empresa que no es
  -- notaría, dependencia ni funcionario. Si hay más de una candidata no se adivina.
  select re.entidad_id into v_principal
    from public.registro_entidad re
    join public.entidad e on e.encargo_id = re.encargo_id and e.id = re.entidad_id
   where re.encargo_id = p_encargo and re.registro_id = p_registro
     and re.rol = 'titular' and e.tipo = 'persona_moral'
   limit 1;
  if v_principal is null then
    select min(re.entidad_id::text)::uuid into v_principal
      from public.registro_entidad re
      join public.entidad e on e.encargo_id = re.encargo_id and e.id = re.entidad_id
     where re.encargo_id = p_encargo and re.registro_id = p_registro
       and e.tipo = 'persona_moral'
       and re.rol not in ('notario', 'dependencia', 'funcionario', 'testigo')
    having count(distinct re.entidad_id) = 1;
  end if;
  if v_principal is null then
    return 0;
  end if;

  -- Capital social del documento (campo común «monto», validado).
  select nullif(x.valor_normalizado ->> 'monto', '')::numeric into v_capital
    from public.extraccion x
   where x.encargo_id = p_encargo and x.registro_id = p_registro and x.campo = 'monto'
     and x.estado in ('validado', 'corregido')
   limit 1;

  for v_m in
    select re.entidad_id, re.rol, e.nombre_normalizado, e.identificadores ->> 'rfc' as rfc
      from public.registro_entidad re
      join public.entidad e on e.encargo_id = re.encargo_id and e.id = re.entidad_id
     where re.encargo_id = p_encargo and re.registro_id = p_registro
       and re.entidad_id <> v_principal
       and privado.fuerza_papel(re.rol) is not null
  loop
    -- Su lectura validada: mismo papel y mismo nombre (o RFC).
    select x.id, x.valor_normalizado into v_x
      from public.extraccion x
     where x.encargo_id = p_encargo and x.registro_id = p_registro
       and x.campo ~ '^involucrado_[0-9]+$' and x.estado in ('validado', 'corregido')
       and x.valor_normalizado ->> 'rol' = v_m.rol
       and (x.valor_normalizado ->> 'nombre' = v_m.nombre_normalizado
            or (v_m.rfc is not null and x.valor_normalizado ->> 'rfc' = v_m.rfc))
     order by x.campo
     limit 1;

    v_monto := null;
    v_moneda := null;
    v_part := null;
    v_fuerza := privado.fuerza_papel(v_m.rol);
    if v_m.rol = 'socio' and v_x.valor_normalizado ? 'aportacion' then
      v_monto := nullif(v_x.valor_normalizado -> 'aportacion' ->> 'monto', '')::numeric(18, 2);
      v_moneda := nullif(v_x.valor_normalizado -> 'aportacion' ->> 'moneda', '');
      if v_monto is null or v_moneda is null then
        v_monto := null;
        v_moneda := null;
      elsif v_capital > 0 and v_monto > 0 then
        v_part := least(1, round(v_monto / v_capital, 5));
        v_fuerza := greatest(1, least(10, ceil(v_part * 10)))::smallint;
      end if;
    end if;

    insert into public.vinculo (
      organizacion_id, encargo_id, origen_id, destino_id, tipo, fuerza, dirigido,
      monto, moneda, participacion, registro_id, creado_por
    )
    values (
      v_org, p_encargo, v_m.entidad_id, v_principal, v_m.rol, v_fuerza, true,
      v_monto, v_moneda, v_part, p_registro, null
    )
    on conflict (registro_id, origen_id, destino_id, tipo) where registro_id is not null do nothing
    returning id into v_id;

    if v_id is not null then
      insert into public.evidencia (organizacion_id, encargo_id, objeto_tipo, objeto_id, registro_id, extraccion_id, creado_por)
      values (v_org, p_encargo, 'vinculo', v_id, p_registro, v_x.id, null);
      v_nuevos := v_nuevos + 1;
    end if;
    v_id := null;
  end loop;
  return v_nuevos;
end;
$$;
revoke all on function privado.vinculos_de_documento(uuid, uuid) from public, anon, authenticated;

-- Al terminar la transacción que valida o captura un documento (cuando ya están todas sus
-- entidades y lecturas) se derivan sus vínculos. Diferido: corre una vez por mención, y es
-- idempotente.
create function privado.derivar_vinculos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform privado.vinculos_de_documento(new.encargo_id, new.registro_id);
  return null;
end;
$$;
revoke all on function privado.derivar_vinculos() from public, anon, authenticated;

create constraint trigger registro_entidad_vinculos
  after insert on public.registro_entidad
  deferrable initially deferred
  for each row execute function privado.derivar_vinculos();

-- ---------------------------------------------------------------------------
-- 3. Documentos ya validados
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select distinct re.encargo_id, re.registro_id
      from public.registro_entidad re
      join public.registro g on g.encargo_id = re.encargo_id and g.id = re.registro_id
     where g.estado_validacion in ('validado', 'corregido') and g.origen in ('documento', 'captura')
  loop
    perform privado.vinculos_de_documento(r.encargo_id, r.registro_id);
  end loop;
end;
$$;
