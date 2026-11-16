-- Uso de IA: permisos por encargo, topes, bitácora de consumo y quién ve qué.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

select is((select ia_proveedores from public.encargo where id = 'c0000000-0000-4000-8000-000000000001'),
          '{}'::text[], 'un encargo existente queda con la IA apagada');

set local role authenticated;

-- Auditor: no enciende la IA, ni al crear un encargo ni al editarlo; tampoco configura ni ve el consumo.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$ update public.encargo set ia_proveedores = '{anthropic}' where id = 'c0000000-0000-4000-8000-000000000001' $$,
                 '42501', null, 'auditor no enciende la IA de un encargo');
insert into public.encargo (id, organizacion_id, nombre, ia_proveedores)
values ('c0000000-0000-4000-8000-0000000000aa', 'b0000000-0000-4000-8000-000000000001', 'Encargo IA', '{anthropic,openai}');
select is((select ia_proveedores from public.encargo where id = 'c0000000-0000-4000-8000-0000000000aa'),
          '{}'::text[], 'un encargo nuevo nace con la IA apagada aunque el insert pida otra cosa');
select throws_ok($$ select public.guardar_configuracion_ia('b0000000-0000-4000-8000-000000000001', true, 10, 10) $$,
                 '42501', null, 'auditor no cambia los topes');
select throws_ok($$ select public.ia_permitida('c0000000-0000-4000-8000-000000000001', 'anthropic') $$,
                 '42501', null, 'los usuarios no consultan ia_permitida');
select throws_ok($$ select public.registrar_uso_ia('{}'::jsonb) $$, '42501', null, 'ni registran uso');

-- Admin: enciende Anthropic en el encargo y queda en bitácora.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$ update public.encargo set ia_proveedores = '{anthropic}' where id = 'c0000000-0000-4000-8000-000000000001' $$,
                'admin enciende Anthropic en el encargo');
select is((select count(*) from public.bitacora where accion = 'encargo.ia'), 1::bigint, 'el cambio queda en bitácora');
select throws_ok($$ update public.encargo set ia_proveedores = '{otro}' where id = 'c0000000-0000-4000-8000-000000000001' $$,
                 '23514', null, 'solo proveedores conocidos');
select lives_ok($$ select public.guardar_configuracion_ia('b0000000-0000-4000-8000-000000000001', true, 1000, 5000) $$,
                'admin fija los topes');
insert into public.precio_ia (organizacion_id, proveedor, modelo, usd_millon_entrada, usd_millon_salida)
values ('b0000000-0000-4000-8000-000000000001', 'anthropic', 'modelo-prueba', 3, 15);

-- Procesador (service_role).
reset role;
set local role service_role;
select is(public.ia_permitida('c0000000-0000-4000-8000-000000000001', 'anthropic') ->> 'permitida', 'true',
          'Anthropic permitido en el encargo');
select is(public.ia_permitida('c0000000-0000-4000-8000-000000000001', 'openai') ->> 'motivo',
          'proveedor_no_permitido_en_encargo', 'OpenAI no está permitido en este encargo');
select is(public.ia_permitida('c0000000-0000-4000-8000-0000000000aa', 'anthropic') ->> 'motivo',
          'proveedor_no_permitido_en_encargo', 'el encargo nuevo no permite ninguno');
select lives_ok($$ select public.registrar_uso_ia(jsonb_build_object(
  'organizacion_id', 'b0000000-0000-4000-8000-000000000001', 'encargo_id', 'c0000000-0000-4000-8000-000000000001',
  'proveedor', 'anthropic', 'modelo', 'modelo-prueba', 'funcion', 'extraccion',
  'tokens_entrada', 800, 'tokens_salida', 100, 'resultado', 'ok', 'duracion_ms', 1200)) $$, 'registra una llamada');
select is(public.ia_permitida('c0000000-0000-4000-8000-000000000001', 'anthropic') ->> 'permitida', 'true',
          '900 de 1000 tokens: aún dentro del tope diario');
select lives_ok($$ select public.registrar_uso_ia(jsonb_build_object(
  'organizacion_id', 'b0000000-0000-4000-8000-000000000001', 'encargo_id', 'c0000000-0000-4000-8000-000000000001',
  'proveedor', 'anthropic', 'modelo', 'modelo-prueba', 'funcion', 'extraccion',
  'tokens_entrada', 150, 'tokens_salida', 0, 'resultado', 'error', 'codigo_error', '529')) $$, 'registra un fallo');
select is(public.ia_permitida('c0000000-0000-4000-8000-000000000001', 'anthropic') ->> 'motivo', 'tope_diario',
          'al llegar al tope diario se bloquea');
select throws_ok($$ update public.uso_ia set tokens_entrada = 0 $$, '42501', null, 'el consumo no se edita');
select throws_ok($$ delete from public.uso_ia $$, '42501', null, 'ni se borra');

-- Interruptor general.
reset role;
set local role authenticated;
select lives_ok($$ select public.guardar_configuracion_ia('b0000000-0000-4000-8000-000000000001', false, 100000, 500000) $$,
                'admin apaga la IA de la organización');
select is((select count(*) from public.bitacora where accion = 'ia.configuracion'), 2::bigint, 'cada cambio de configuración queda en bitácora');
reset role;
set local role service_role;
select is(public.ia_permitida('c0000000-0000-4000-8000-000000000001', 'anthropic') ->> 'motivo',
          'ia_apagada_organizacion', 'con el interruptor general apagado no pasa nada');

-- Panel: el admin ve el resumen con costo estimado; el auditor no ve nada.
reset role;
set local role authenticated;
select is(public.resumen_uso_ia('b0000000-0000-4000-8000-000000000001') -> 'mes' ->> 'tokens', '1050', 'tokens del mes');
select is((public.resumen_uso_ia('b0000000-0000-4000-8000-000000000001') -> 'mes' ->> 'usd')::numeric,
          0.00435, 'costo estimado con los precios capturados');
select is(jsonb_array_length(public.resumen_uso_ia('b0000000-0000-4000-8000-000000000001') -> 'recientes'), 1,
          'el fallo aparece en recientes');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*) from public.uso_ia), 0::bigint, 'auditor no ve el consumo');
select is(public.resumen_uso_ia('b0000000-0000-4000-8000-000000000001') -> 'mes' ->> 'tokens', '0', 'ni en el resumen');

reset role;
select * from finish();
rollback;
