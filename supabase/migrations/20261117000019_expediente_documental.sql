-- Tarea 10 · Migración 19: expediente documental.
-- docs/ESPECIFICACION.md §6.1.
--
-- Funciones de consulta, solo de lectura y `security invoker`: corren con los permisos de quien
-- consulta, así que RLS decide qué registros ve (no cambian quién ve qué).
--
--  * `expediente_registros`: la tabla única, con filtros, búsqueda, orden y paginación en servidor.
--  * `expediente_arbol`: conteos expediente → entidad → categoría con los mismos filtros, para que
--    el conteo de cada nodo sea el total de la tabla al elegirlo.
--
-- Filtros (p jsonb): encargo_id (obligatorio); expediente_id (uuid o 'sin'); entidad_id (uuid o 'sin');
-- categoria_id (uuid o 'sin'); tipo_documento_id; origen; estado; q; desde; hasta.
-- Tabla además: orden (fecha | resumen | tipo | estado | calificacion), dir (asc | desc),
-- limite (1–500), desplazamiento.

-- Texto comparable: minúsculas y sin acentos (no hay extensión unaccent en el proyecto).
create function privado.plano(p text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select translate(lower(coalesce(p, '')), 'áàäâéèëêíìïîóòöôúùüûñç', 'aaaaeeeeiiiioooouuuunc');
$$;
grant execute on function privado.plano(text) to authenticated;

create index registro_fecha_idx on public.registro (encargo_id, fecha_documento);

-- ---------------------------------------------------------------------------
-- Registros del encargo que pasan los filtros que no son del árbol, con lo que la tabla muestra.
-- ---------------------------------------------------------------------------
create function privado.expediente_base(p jsonb)
returns table (
  registro_id uuid,
  resumen text,
  expediente_id uuid,
  expediente text,
  tipo_documento_id uuid,
  tipo text,
  categoria_id uuid,
  categoria text,
  categoria_orden int,
  origen text,
  fecha date,
  fuente text,
  documento_id uuid,
  archivo text,
  sha256 text,
  hoja text,
  fila int,
  estado_validacion text,
  estado_extraccion text,
  creado_en timestamptz,
  entidades uuid[],
  involucrados jsonb,
  identificadores jsonb,
  referencias text[],
  montos jsonb,
  nivel text,
  alertas int)
language sql
stable
security invoker
set search_path = ''
as $$
  with
  parametros as (
    select (p ->> 'encargo_id')::uuid as encargo,
           nullif(p ->> 'tipo_documento_id', '')::uuid as tipo,
           nullif(p ->> 'origen', '') as origen,
           nullif(p ->> 'estado', '') as estado,
           nullif(p ->> 'desde', '')::date as desde,
           nullif(p ->> 'hasta', '')::date as hasta,
           array(select t from regexp_split_to_table(privado.plano(trim(coalesce(p ->> 'q', ''))), '\s+') t
                  where length(t) > 0 limit 8) as terminos
  ),
  ultima_red as (
    select g.id from public.red_generada g, parametros
     where g.encargo_id = parametros.encargo
     order by g.generada_en desc limit 1
  ),
  registros as (
    select r.*, d.nombre_archivo, d.sha256 as huella, td.nombre as tipo_nombre, td.categoria_id as cat_id,
           c.nombre as cat_nombre, c.orden as cat_orden, x.identificador as exp_identificador
      from public.registro r
      cross join parametros
      left join public.documento_origen d on d.id = r.documento_id
      left join public.tipo_documento td on td.id = r.tipo_documento_id
      left join public.categoria_documental c on c.id = td.categoria_id
      left join public.expediente x on x.id = r.expediente_id
     where r.encargo_id = parametros.encargo
       and (parametros.tipo is null or r.tipo_documento_id = parametros.tipo)
       and (parametros.origen is null or r.origen = parametros.origen)
       and (parametros.estado is null
            or (parametros.estado = 'validados' and r.estado_validacion in ('validado', 'corregido'))
            or r.estado_validacion = parametros.estado)
  ),
  detalle as (
    select r.id,
           -- Involucrados (entidad canónica si fue fusionada) con su rol.
           (select coalesce(jsonb_agg(distinct jsonb_build_object(
                      'entidad_id', coalesce(e.fusionada_en, e.id), 'nombre', e.nombre, 'tipo', e.tipo,
                      'rol', re.rol)), '[]'::jsonb)
              from public.registro_entidad re join public.entidad e on e.id = re.entidad_id
             where re.registro_id = r.id) as involucrados,
           array(select distinct coalesce(e.fusionada_en, e.id)
                   from public.registro_entidad re join public.entidad e on e.id = re.entidad_id
                  where re.registro_id = r.id) as entidades,
           (select coalesce(jsonb_agg(distinct jsonb_build_object('tipo', k, 'valor', e.identificadores ->> k)),
                            '[]'::jsonb)
              from public.registro_entidad re join public.entidad e on e.id = re.entidad_id
              cross join unnest(array['rfc', 'curp']) k
             where re.registro_id = r.id and e.identificadores ->> k is not null
               and not coalesce(e.identificadores -> 'invalidos', '[]'::jsonb) ? k) as identificadores,
           -- Referencias: números de contrato, factura, cuenta o expediente, y el número del evento.
           array(select distinct v from (
                   select left(trim(x.valor_crudo), 60) as v
                     from public.extraccion x
                    where x.registro_id = r.id and x.estado in ('validado', 'corregido')
                      and privado.plano(x.campo) ~ '(contrato|factura|cuenta|folio|expediente)'
                      and jsonb_typeof(x.valor_normalizado) is distinct from 'object'
                      and length(trim(coalesce(x.valor_crudo, ''))) between 1 and 60
                   union
                   select left(ev.atributos ->> 'numero', 60)
                     from public.evidencia vi join public.evento ev on ev.id = vi.objeto_id
                    where vi.registro_id = r.id and vi.objeto_tipo = 'evento' and ev.atributos ->> 'numero' is not null
                 ) refs where v is not null order by v limit 6) as referencias,
           -- Montos: de los eventos que generó y de los datos con monto y moneda.
           (select coalesce(jsonb_agg(distinct m), '[]'::jsonb) from (
              select jsonb_build_object('monto', ev.monto::text, 'moneda', coalesce(ev.moneda, 'MXN')) as m
                from public.evidencia vi join public.evento ev on ev.id = vi.objeto_id
               where vi.registro_id = r.id and vi.objeto_tipo = 'evento' and ev.monto is not null
              union
              select jsonb_build_object('monto', x.valor_normalizado ->> 'monto',
                                        'moneda', coalesce(x.valor_normalizado ->> 'moneda', 'MXN'))
                from public.extraccion x
               where x.registro_id = r.id and x.estado in ('validado', 'corregido')
                 and jsonb_typeof(x.valor_normalizado) = 'object' and x.valor_normalizado ? 'monto'
                 and x.campo <> 'total_declarado'
            ) montos) as montos,
           (select min(ev.fecha_hora)::date
              from public.evidencia vi join public.evento ev on ev.id = vi.objeto_id
             where vi.registro_id = r.id and vi.objeto_tipo = 'evento') as fecha_evento,
           (select x.ubicacion from public.extraccion x
             where x.registro_id = r.id and x.ubicacion ? 'hoja' order by x.creado_en limit 1) as ubicacion,
           -- Calificación: el nivel más alto de sus entidades en la última red del encargo.
           (select (array['critico', 'alto', 'medio', 'bajo'])[min(array_position(
                      array['critico', 'alto', 'medio', 'bajo'], coalesce(ca.ajuste_nivel, ca.nivel)))]
              from public.registro_entidad re
              join public.entidad e on e.id = re.entidad_id
              join public.calificacion ca on ca.objeto_tipo = 'entidad'
                and ca.objeto_id = coalesce(e.fusionada_en, e.id)
                and ca.red_id = (select id from ultima_red)
             where re.registro_id = r.id) as nivel,
           (select count(distinct a.id)::int
              from public.evidencia vi join public.alerta a on a.id = vi.objeto_id
             where vi.registro_id = r.id and vi.objeto_tipo = 'alerta'
               and a.estado = 'abierta' and a.vigente) as alertas
      from registros r
  )
  select r.id, r.resumen, r.expediente_id, r.exp_identificador, r.tipo_documento_id, r.tipo_nombre,
         r.cat_id, r.cat_nombre, r.cat_orden, r.origen,
         coalesce(r.fecha_documento, d.fecha_evento) as fecha,
         r.fuente, r.documento_id, r.nombre_archivo, r.huella,
         d.ubicacion ->> 'hoja', nullif(d.ubicacion ->> 'fila', '')::int,
         r.estado_validacion, r.estado_extraccion, r.creado_en,
         d.entidades, d.involucrados, d.identificadores, d.referencias, d.montos, d.nivel, d.alertas
    from registros r
    join detalle d on d.id = r.id
    cross join parametros
   where (parametros.desde is null or coalesce(r.fecha_documento, d.fecha_evento) >= parametros.desde)
     and (parametros.hasta is null or coalesce(r.fecha_documento, d.fecha_evento) <= parametros.hasta)
     -- Búsqueda: todos los términos deben aparecer en el resumen, el archivo, los involucrados,
     -- sus identificadores, las referencias o algún dato validado del registro.
     and (cardinality(parametros.terminos) = 0 or not exists (
       select 1 from unnest(parametros.terminos) t
        where position(t in privado.plano(concat_ws(' ', r.resumen, r.nombre_archivo, r.fuente,
                                                    r.exp_identificador, d.involucrados::text,
                                                    d.identificadores::text, array_to_string(d.referencias, ' ')))) = 0
          and not exists (select 1 from public.extraccion x
                           where x.registro_id = r.id and x.estado in ('validado', 'corregido')
                             and position(t in privado.plano(x.valor_crudo)) > 0)));
$$;
grant execute on function privado.expediente_base(jsonb) to authenticated;

-- Filtros del árbol: expediente, entidad y categoría ('sin' = sin asignar).
create function privado.expediente_en_arbol(
  p jsonb, p_expediente uuid, p_entidades uuid[], p_categoria uuid)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select (nullif(p ->> 'expediente_id', '') is null
          or (p ->> 'expediente_id' = 'sin' and p_expediente is null)
          or (p ->> 'expediente_id' <> 'sin' and p_expediente = (p ->> 'expediente_id')::uuid))
     and (nullif(p ->> 'entidad_id', '') is null
          or (p ->> 'entidad_id' = 'sin' and cardinality(p_entidades) = 0)
          or (p ->> 'entidad_id' <> 'sin' and (p ->> 'entidad_id')::uuid = any (p_entidades)))
     and (nullif(p ->> 'categoria_id', '') is null
          or (p ->> 'categoria_id' = 'sin' and p_categoria is null)
          or (p ->> 'categoria_id' <> 'sin' and p_categoria = (p ->> 'categoria_id')::uuid));
$$;
grant execute on function privado.expediente_en_arbol(jsonb, uuid, uuid[], uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Tabla: una página de registros y el total que cumple los filtros.
-- ---------------------------------------------------------------------------
create function public.expediente_registros(p jsonb)
returns table (
  registro_id uuid, resumen text, expediente_id uuid, expediente text, tipo text,
  categoria_id uuid, categoria text, origen text, fecha date, fuente text, documento_id uuid,
  archivo text, sha256 text, hoja text, fila int, estado_validacion text, estado_extraccion text,
  involucrados jsonb, identificadores jsonb, referencias text[], montos jsonb, nivel text,
  alertas int, total bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with filas as (
    select b.*, count(*) over () as total
      from privado.expediente_base(p) b
     where privado.expediente_en_arbol(p, b.expediente_id, b.entidades, b.categoria_id)
  )
  select f.registro_id, f.resumen, f.expediente_id, f.expediente, f.tipo, f.categoria_id, f.categoria,
         f.origen, f.fecha, f.fuente, f.documento_id, f.archivo, f.sha256, f.hoja, f.fila,
         f.estado_validacion, f.estado_extraccion, f.involucrados, f.identificadores, f.referencias,
         f.montos, f.nivel, f.alertas, f.total
    from filas f
   order by
     case when coalesce(p ->> 'dir', 'desc') = 'asc' then
       case coalesce(p ->> 'orden', 'fecha')
         when 'fecha' then to_char(f.fecha, 'YYYY-MM-DD')
         when 'resumen' then privado.plano(f.resumen)
         when 'tipo' then privado.plano(coalesce(f.categoria, '~') || ' ' || coalesce(f.tipo, ''))
         when 'estado' then f.estado_validacion
         when 'calificacion' then coalesce(array_position(array['critico', 'alto', 'medio', 'bajo'], f.nivel), 9)::text
       end
     end asc nulls last,
     case when coalesce(p ->> 'dir', 'desc') <> 'asc' then
       case coalesce(p ->> 'orden', 'fecha')
         when 'fecha' then to_char(f.fecha, 'YYYY-MM-DD')
         when 'resumen' then privado.plano(f.resumen)
         when 'tipo' then privado.plano(coalesce(f.categoria, '~') || ' ' || coalesce(f.tipo, ''))
         when 'estado' then f.estado_validacion
         -- Descendente en calificación = de mayor a menor riesgo.
         when 'calificacion' then (9 - coalesce(array_position(array['critico', 'alto', 'medio', 'bajo'], f.nivel), 9))::text
       end
     end desc nulls last,
     f.creado_en, f.registro_id
   limit least(greatest(coalesce((p ->> 'limite')::int, 50), 1), 500)
  offset greatest(coalesce((p ->> 'desplazamiento')::int, 0), 0);
$$;
revoke all on function public.expediente_registros(jsonb) from public, anon;
grant execute on function public.expediente_registros(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Árbol: registros por expediente, por expediente y entidad, y por expediente, entidad y categoría.
-- Un registro con dos entidades cuenta en ambas; por eso cada nivel trae su propio conteo.
-- Un registro sin entidades cuenta en el nodo «Sin entidades» (entidad nula, nivel 2 y 3).
-- ---------------------------------------------------------------------------
create function public.expediente_arbol(p jsonb)
returns table (
  nivel smallint, expediente_id uuid, expediente text, entidad_id uuid, entidad text, entidad_tipo text,
  categoria_id uuid, categoria text, registros bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  with base as (
    select b.registro_id, b.expediente_id, b.expediente, b.categoria_id, b.categoria, b.categoria_orden,
           b.entidades
      from privado.expediente_base(p) b
  ),
  por_entidad as (
    select b.*, ent.id as entidad_id
      from base b
      left join lateral unnest(case when cardinality(b.entidades) > 0 then b.entidades
                                    else array[null::uuid] end) ent(id) on true
  )
  select g.nivel, g.expediente_id, g.expediente, g.entidad_id, e.nombre, e.tipo, g.categoria_id, g.categoria,
         g.registros
    from (
      select 1::smallint as nivel, expediente_id, max(expediente) as expediente, null::uuid as entidad_id,
             null::uuid as categoria_id, null::text as categoria, count(distinct registro_id) as registros
        from base group by expediente_id
      union all
      select 2, expediente_id, max(expediente), entidad_id, null, null, count(distinct registro_id)
        from por_entidad group by expediente_id, entidad_id
      union all
      select 3, expediente_id, max(expediente), entidad_id, categoria_id, max(categoria), count(distinct registro_id)
        from por_entidad group by expediente_id, entidad_id, categoria_id
    ) g
    left join public.entidad e on e.id = g.entidad_id
   order by g.expediente nulls last, g.nivel, g.registros desc, e.nombre nulls last, g.categoria nulls last;
$$;
revoke all on function public.expediente_arbol(jsonb) from public, anon;
grant execute on function public.expediente_arbol(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- Bitácora de un registro (y de su documento), para su página de detalle. Resuelve el correo de
-- quien actuó: la bitácora guarda solo IDs. Security definer porque `auth.users` no es legible
-- por los usuarios; por eso verifica que quien consulta sea miembro de la organización del
-- registro, y solo devuelve filas de ese registro o de su documento.
-- ---------------------------------------------------------------------------
create function public.bitacora_registro(p_registro uuid)
returns table (en timestamptz, accion text, actor_correo text, detalle jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  r public.registro;
begin
  select * into r from public.registro where id = p_registro;
  if not found or not public.es_miembro(r.organizacion_id) then
    raise exception 'registro inexistente' using errcode = 'P0002';
  end if;
  return query
  select b.en, b.accion, u.email::text, b.detalle
    from public.bitacora b
    left join auth.users u on u.id = b.actor
   where b.organizacion_id = r.organizacion_id
     and (b.objeto_id = r.id or (r.documento_id is not null and b.objeto_id = r.documento_id))
   order by b.en desc
   limit 200;
end;
$$;
revoke all on function public.bitacora_registro(uuid) from public, anon;
grant execute on function public.bitacora_registro(uuid) to authenticated;
