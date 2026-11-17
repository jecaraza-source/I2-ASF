-- Validación de extracciones: decisión por campo, valor original de la IA y materialización.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into storage.objects (bucket_id, name) values
  ('originales', 'b0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000001/' || repeat('6', 64)),
  ('originales', 'b0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000001/' || repeat('7', 64));

-- Dos documentos leídos por la IA (uno para validar y otro para rechazar).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select public.registrar_documento(jsonb_build_object(
  'encargo_id', 'c0000000-0000-4000-8000-000000000001', 'sha256', repeat(d.n, 64),
  'nombre_archivo', 'val-' || d.n || '.pdf', 'mime', 'application/pdf', 'tamano', 10,
  'tipo_documento_id', (select id from public.tipo_documento
                         where organizacion_id = 'b0000000-0000-4000-8000-000000000001' and clave = 'contrato'),
  'fuente', 'Prueba', 'expediente_nuevo', 'EXP-VAL-' || d.n))
  from (values ('6'), ('7')) d(n);
reset role;
set local role service_role;
select public.guardar_extraccion_ia(jsonb_build_object(
  'registro_id', (select id from public.registro where resumen = 'val-' || d.n || '.pdf'),
  'proveedor', 'anthropic', 'modelo', 'm',
  'extracciones', jsonb_build_array(
    jsonb_build_object('campo', 'numero_contrato', 'valor_crudo', 'C-9', 'valor_normalizado', 'C-9',
                       'confianza', 0.95, 'ubicacion', jsonb_build_object('pagina', 1), 'estado', 'validado'),
    jsonb_build_object('campo', 'monto', 'valor_crudo', '$1,500', 'valor_normalizado', jsonb_build_object('monto', '1500.00', 'moneda', 'MXN'),
                       'confianza', 0.4, 'ubicacion', jsonb_build_object('pagina', 3), 'estado', 'pendiente'),
    jsonb_build_object('campo', 'objeto', 'valor_crudo', 'Obra', 'valor_normalizado', 'Obra',
                       'confianza', 0.3, 'ubicacion', '{}'::jsonb, 'estado', 'pendiente'),
    jsonb_build_object('campo', 'involucrado_1', 'valor_crudo', 'PROVEEDOR VALIDADO SA', 'valor_normalizado', '{}'::jsonb,
                       'confianza', 0.9, 'ubicacion', jsonb_build_object('pagina', 1), 'estado', 'validado'))))
  from (values ('6'), ('7')) d(n);
reset role;

create temporary table t_val on commit drop as
  select r.id as registro, x.campo, x.id as extraccion
    from public.registro r join public.extraccion x on x.registro_id = r.id
   where r.resumen = 'val-6.pdf';
grant select on t_val to authenticated;

create function pg_temp.carga(p_quitar text default null) returns jsonb language sql as $$
  select jsonb_build_object(
    'registro_id', (select registro from t_val limit 1),
    'expediente_id', (select expediente_id from public.registro where id = (select registro from t_val limit 1)),
    'fecha_documento', '2022-03-15', 'resumen', 'Contrato C-9',
    'decisiones', (select jsonb_agg(jsonb_build_object('extraccion_id', extraccion, 'estado',
        case campo when 'monto' then 'corregido' when 'objeto' then 'rechazado' else 'validado' end,
        'valor_crudo', '$2,000', 'valor_normalizado', jsonb_build_object('monto', '2000.00', 'moneda', 'MXN')))
      from t_val where campo is distinct from p_quitar),
    'nuevas', jsonb_build_array(jsonb_build_object('campo', 'involucrado_2', 'valor_crudo', 'DEPENDENCIA X', 'valor_normalizado', '{}'::jsonb)),
    'involucrados', jsonb_build_array(
      jsonb_build_object('campo', 'involucrado_1', 'tipo', 'persona_moral', 'nombre', 'PROVEEDOR VALIDADO SA',
                         'nombre_normalizado', 'PROVEEDOR VALIDADO', 'rol', 'proveedor', 'identificadores', '{}'::jsonb),
      jsonb_build_object('campo', 'involucrado_2', 'tipo', 'dependencia', 'nombre', 'DEPENDENCIA X',
                         'nombre_normalizado', 'DEPENDENCIA X', 'rol', 'dependencia', 'identificadores', '{}'::jsonb)),
    'evento', jsonb_build_object('tipo', 'contrato', 'fecha_hora', '2022-03-15T00:00:00-06:00', 'monto', '2000.00',
      'moneda', 'MXN', 'atributos', jsonb_build_object('numero', 'C-9'),
      'participantes', jsonb_build_array(jsonb_build_object('indice', 0, 'rol', 'destino'),
                                         jsonb_build_object('indice', 1, 'rol', 'origen'))));
$$;

set local role authenticated;

-- Lector: no valida ni rechaza.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$ select public.validar_registro(pg_temp.carga()) $$, 'P0002', null,
                 'lector no valida (RLS no le deja tomar el registro)');
select throws_ok($$ select public.rechazar_registro((select registro from t_val limit 1), 'documento equivocado') $$,
                 'P0002', null, 'lector no rechaza');
select is((select count(*) from public.extraccion where registro_id = (select registro from t_val limit 1)
            and validado_por is not null), 0::bigint, 'y nada cambió');

-- Auditor.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select public.validar_registro(pg_temp.carga('objeto')) $$, '22023', null,
                 'toda lectura de la IA necesita una decisión');
select is((select estado_validacion from public.registro where id = (select registro from t_val limit 1)),
          'pendiente', 'una validación incompleta no guarda nada');
select is((select count(*) from public.entidad where nombre = 'PROVEEDOR VALIDADO SA'), 0::bigint,
          'antes de validar no hay entidad');

select is(public.validar_registro(pg_temp.carga()) ->> 'entidades', '2', 'auditor valida el registro');
select results_eq($$
  select campo, metodo, estado, valor_crudo, valor_original ->> 'valor_crudo', validado_por is not null
    from public.extraccion where registro_id = (select registro from t_val limit 1) order by campo
$$, $$ values
  ('involucrado_1', 'ia', 'validado', 'PROVEEDOR VALIDADO SA', null, true),
  ('involucrado_2', 'manual', 'validado', 'DEPENDENCIA X', null, true),
  ('monto', 'ia', 'corregido', '$2,000', '$1,500', true),
  ('numero_contrato', 'ia', 'validado', 'C-9', null, true),
  ('objeto', 'ia', 'rechazado', 'Obra', null, true) $$,
  'cada campo queda con su decisión y la corrección conserva lo que leyó la IA');
select is((select valor_original -> 'valor_normalizado' ->> 'monto' from public.extraccion
            where registro_id = (select registro from t_val limit 1) and campo = 'monto'),
          '1500.00', 'también el valor normalizado original');
select is((select estado_validacion || '/' || fecha_documento::text || '/' || resumen from public.registro
            where id = (select registro from t_val limit 1)),
          'corregido/2022-03-15/Contrato C-9', 'el registro queda corregido');
select is((select count(*) from public.entidad where nombre in ('PROVEEDOR VALIDADO SA', 'DEPENDENCIA X')),
          2::bigint, 'al validar aparecen las entidades');
select is((select x.campo from public.evidencia ev join public.extraccion x on x.id = ev.extraccion_id
            join public.entidad e on e.id = ev.objeto_id
           where ev.objeto_tipo = 'entidad' and e.nombre = 'PROVEEDOR VALIDADO SA'),
          'involucrado_1', 'la evidencia de la entidad apunta a su extracción');
select is((select e.monto::text || '/' || (select count(*) from public.evento_participante p where p.evento_id = e.id)
             from public.evento e join public.evidencia ev on ev.objeto_id = e.id and ev.objeto_tipo = 'evento'
            where ev.registro_id = (select registro from t_val limit 1)),
          '2000.00/2', 'y el evento usa el monto corregido, con sus dos participantes');
select is((select detalle ->> 'corregidas' from public.bitacora
            where accion = 'registro.validacion' and objeto_id = (select registro from t_val limit 1)),
          '1', 'la validación queda en bitácora');
select throws_ok($$ select public.validar_registro(pg_temp.carga()) $$, '22023', null,
                 'un registro ya validado no se valida otra vez');

-- Rechazo del registro completo.
select throws_ok($$ select public.rechazar_registro((select id from public.registro where resumen = 'val-7.pdf'), ' ') $$,
                 '22023', null, 'el rechazo exige motivo');
select lives_ok($$ select public.rechazar_registro((select id from public.registro where resumen = 'val-7.pdf'), 'No es un contrato') $$,
                'auditor rechaza la lectura completa');
select is((select r.estado_validacion || '/' || (select string_agg(distinct x.estado, ',') from public.extraccion x where x.registro_id = r.id)
             from public.registro r where r.resumen = 'val-7.pdf'),
          'rechazado/rechazado', 'registro y lecturas quedan rechazados');
select is((select detalle ->> 'motivo' from public.bitacora where accion = 'registro.rechazo'),
          'No es un contrato', 'con el motivo en bitácora');
select is((select count(*) from public.registro_entidad re
            where re.registro_id = (select id from public.registro where resumen = 'val-7.pdf')),
          0::bigint, 'un registro rechazado no crea entidades');

reset role;
select * from finish();
rollback;
