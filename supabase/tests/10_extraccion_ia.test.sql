-- Extracción con IA: tope por proveedor, guardado de extracciones y reencolado.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into storage.objects (bucket_id, name) values
  ('originales', 'b0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000001/' || repeat('5', 64));

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
update public.encargo set ia_proveedores = '{anthropic,openai}' where id = 'c0000000-0000-4000-8000-000000000001';
select public.registrar_documento(jsonb_build_object(
  'encargo_id', 'c0000000-0000-4000-8000-000000000001', 'sha256', repeat('5', 64),
  'nombre_archivo', 'contrato.pdf', 'mime', 'application/pdf', 'tamano', 10,
  'tipo_documento_id', (select id from public.tipo_documento
                         where organizacion_id = 'b0000000-0000-4000-8000-000000000001' and clave = 'contrato'),
  'fuente', 'Prueba', 'expediente_nuevo', 'EXP-IA'));
select lives_ok($$ select public.guardar_tope_proveedor_ia('b0000000-0000-4000-8000-000000000001', 'anthropic', 1000, null) $$,
                'admin fija el tope diario de Anthropic');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select public.guardar_tope_proveedor_ia('b0000000-0000-4000-8000-000000000001', 'anthropic', 5, null) $$,
                 '42501', null, 'auditor no cambia el tope de un proveedor');
select throws_ok($$ select public.guardar_extraccion_ia('{}'::jsonb) $$, '42501', null, 'los usuarios no guardan extracciones de IA');

-- Procesador.
reset role;
set local role service_role;
select is(public.ia_permitida('c0000000-0000-4000-8000-000000000001', 'anthropic') ->> 'permitida', 'true', 'Anthropic permitido');
select public.registrar_uso_ia(jsonb_build_object(
  'organizacion_id', 'b0000000-0000-4000-8000-000000000001', 'encargo_id', 'c0000000-0000-4000-8000-000000000001',
  'proveedor', 'anthropic', 'modelo', 'm', 'funcion', 'extraccion', 'tokens_entrada', 900, 'tokens_salida', 200, 'resultado', 'ok'));
select is(public.ia_permitida('c0000000-0000-4000-8000-000000000001', 'anthropic') ->> 'motivo', 'tope_proveedor_diario',
          'al agotarse el tope de Anthropic se bloquea ese proveedor');
select is(public.ia_permitida('c0000000-0000-4000-8000-000000000001', 'openai') ->> 'permitida', 'true',
          'y OpenAI sigue disponible como respaldo');

select is(public.guardar_extraccion_ia(jsonb_build_object(
  'registro_id', (select id from public.registro where resumen = 'contrato.pdf'),
  'proveedor', 'openai', 'modelo', 'm', 'fecha_documento', '2022-03-15',
  'extracciones', jsonb_build_array(
    jsonb_build_object('campo', 'numero_contrato', 'valor_crudo', 'C-1', 'valor_normalizado', 'C-1',
                       'confianza', 0.95, 'ubicacion', jsonb_build_object('pagina', 1), 'estado', 'validado'),
    jsonb_build_object('campo', 'monto', 'valor_crudo', '$1,500', 'valor_normalizado', jsonb_build_object('monto', '1500.00', 'moneda', 'MXN'),
                       'confianza', 0.4, 'ubicacion', jsonb_build_object('pagina', 3), 'estado', 'pendiente')))) ->> 'pendientes',
  '1', 'guarda las extracciones y cuenta las pendientes');
select is((select string_agg(estado || ':' || coalesce(validado_por::text, 'auto') || ':' || (validado_en is not null)::text, ',' order by campo)
             from public.extraccion where metodo = 'ia'),
          'pendiente:auto:false,validado:auto:true', 'lo que alcanzó el umbral queda validado sin validador humano');
select is((select estado_extraccion || '/' || estado_validacion || '/' || fecha_documento::text || '/' || extraccion_nota
             from public.registro where resumen = 'contrato.pdf'),
          'hecha/pendiente/2022-03-15/openai', 'el registro queda extraído y pendiente de validación');
select is((select count(*) from public.entidad where encargo_id = 'c0000000-0000-4000-8000-000000000001'
            and creado_en >= now() - interval '1 minute' and nombre = 'x'), 0::bigint, 'la extracción no crea entidades');
select is((select detalle ->> 'pendientes' from public.bitacora where accion = 'extraccion.ia'), '1', 'queda en bitácora sin contenido');
select is(public.guardar_extraccion_ia(jsonb_build_object(
  'registro_id', (select id from public.registro where resumen = 'contrato.pdf'), 'proveedor', 'openai', 'modelo', 'm',
  'extracciones', '[]'::jsonb)) ->> 'repetida', 'true', 'guardar dos veces no duplica (idempotente)');
select is((select count(*) from public.extraccion where metodo = 'ia'), 2::bigint, 'siguen siendo dos extracciones');

-- Reencolar.
update public.registro set estado_extraccion = 'en_espera', extraccion_nota = 'tope_diario' where resumen = 'contrato.pdf';
reset role;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$ select public.encolar_extraccion((select id from public.registro where resumen = 'contrato.pdf')) $$,
                 '42501', null, 'lector no reencola');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(public.encolar_extracciones_en_espera('c0000000-0000-4000-8000-000000000001'), 1, 'auditor reencola lo que estaba en espera');
select is((select estado_extraccion || '/' || coalesce(extraccion_nota, 'sin nota') from public.registro where resumen = 'contrato.pdf'),
          'en_cola/sin nota', 'vuelve a la cola');
select is((select count(*) from public.trabajo where tipo = 'extraccion' and estado = 'pendiente'), 2::bigint, 'con un trabajo nuevo');
select throws_ok($$ select public.encolar_extraccion((select id from public.registro where resumen = 'contrato.pdf')) $$,
                 '22023', null, 'lo que ya está en cola no se reencola');

reset role;
select * from finish();
rollback;
