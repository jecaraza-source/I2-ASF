-- Verificación en campo: el verificador solo ve lo asignado; aviso obligatorio; cédula → registro
-- «campo» validado, idempotente, que pide correr las reglas.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values ('a0000000-0000-4000-8000-0000000000f1', 'verificador@sigma.test');
insert into public.miembro (organizacion_id, usuario_id, rol) values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000f1', 'verificador');

-- Un proveedor con un registro validado que trae su domicilio.
insert into public.entidad (id, organizacion_id, encargo_id, tipo, nombre, nombre_normalizado, identificadores)
values ('e1400000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'persona_moral', 'PROVEEDOR CAMPO SA', 'PROVEEDOR CAMPO SA', '{"rfc":"PCA200101AB1"}'),
       ('e1400000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'cuenta', 'CUENTA 123', 'CUENTA 123', '{}');
insert into public.registro (id, organizacion_id, encargo_id, origen, fuente, estado_validacion, resumen, fecha_documento)
values ('e1400000-0000-4000-8000-0000000000a1', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'captura', 'Oficio', 'validado', 'Factura F-1', '2024-03-01');
insert into public.registro_entidad (organizacion_id, encargo_id, registro_id, entidad_id, rol)
values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'e1400000-0000-4000-8000-0000000000a1', 'e1400000-0000-4000-8000-000000000001', 'proveedor');
insert into public.extraccion (organizacion_id, encargo_id, registro_id, campo, valor_crudo, valor_normalizado, metodo, estado, ubicacion)
values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'e1400000-0000-4000-8000-0000000000a1', 'domicilio', 'Calle Falsa 123, Toluca', '"Calle Falsa 123, Toluca"', 'manual', 'validado', '{}');

-- Programa de trabajo (auditor)
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$ select public.crear_visitas('{"encargo_id":"c0000000-0000-4000-8000-000000000001","verificador_id":"a0000000-0000-4000-8000-000000000003","entidades":["e1400000-0000-4000-8000-000000000001"]}') $$,
  '23514', null, 'un lector no puede verificar');
select is(public.crear_visitas('{"encargo_id":"c0000000-0000-4000-8000-000000000001","verificador_id":"a0000000-0000-4000-8000-0000000000f1","entidades":["e1400000-0000-4000-8000-000000000001","e1400000-0000-4000-8000-000000000002"]}'),
  1, 'una visita al proveedor (la cuenta no se visita)');
select is(public.crear_visitas('{"encargo_id":"c0000000-0000-4000-8000-000000000001","verificador_id":"a0000000-0000-4000-8000-0000000000f1","entidades":["e1400000-0000-4000-8000-000000000001"]}'),
  0, 'no se duplica una visita abierta');
select is((select domicilios from public.visita_campo where entidad_id = 'e1400000-0000-4000-8000-000000000001'),
  array['Calle Falsa 123, Toluca'], 'el domicilio se prellena de lo validado');
select is((select jsonb_array_length(documentos) from public.visita_campo where entidad_id = 'e1400000-0000-4000-8000-000000000001'),
  1, 'y los documentos que lo mencionan');
select set_config('t.v', (select id::text from public.visita_campo where entidad_id = 'e1400000-0000-4000-8000-000000000001'), true);

-- El verificador no lee la organización
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000f1","role":"authenticated"}', true);
select is((select count(*)::int from public.encargo), 0, 'el verificador no ve encargos');
select is((select count(*)::int from public.registro), 0, 'ni registros');
select is((select count(*)::int from public.entidad), 0, 'ni entidades');
select is((select count(*)::int from public.visita_campo), 0, 'ni la tabla de visitas directamente');
select is((select count(*)::int from public.miembro), 1, 'solo su propia membresía');
select is((select count(*)::int from public.organizacion), 1, 'y el nombre de su organización');
select ok(not public.es_miembro('b0000000-0000-4000-8000-000000000001'), 'no cuenta como miembro para leer');

-- Aviso de confidencialidad
select is((select array[count(*)::text, bool_and(not aviso_aceptado)::text, max(jsonb_array_length(documentos))::text]
             from public.campo_mis_visitas()), array['1', 'true', '0'], 've su visita, pero sin documentos hasta aceptar el aviso');
select throws_ok($$ select public.campo_guardar_cedula(jsonb_build_object('id', 'e1400000-0000-4000-8000-0000000000c1', 'visita_id', current_setting('t.v'),
  'capturada_en', now(), 'respuestas', '{"domicilio_existe":"no","inmueble_existe":"no","proveedor_presente":"no","actividad_visible":"no","persona_confirma":"no_verificable"}'::jsonb)) $$,
  '42501', 'acepta el aviso de confidencialidad antes de verificar', 'sin aviso no se verifica');
select throws_ok($$ select public.aceptar_aviso_campo('b0000000-0000-4000-8000-000000000001', '2020-01-01') $$, '23514', null, 'versión vieja del aviso');
select lives_ok($$ select public.aceptar_aviso_campo('b0000000-0000-4000-8000-000000000001', '2026-11-17') $$, 'acepta el aviso vigente');
select is((select max(jsonb_array_length(documentos)) from public.campo_mis_visitas()), 1, 'ahora sí ve los documentos');

-- Fotos: solo a la ruta de su visita; sin el objeto no se registra
select ok(privado.puede_subir_campo(format('%s/%s/%s/%s.jpg', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', current_setting('t.v'), 'e1400000-0000-4000-8000-0000000000e1')),
  'puede subir la foto de su visita');
select ok(not privado.puede_subir_campo(format('%s/%s/%s/%s.exe', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', current_setting('t.v'), 'e1400000-0000-4000-8000-0000000000e1')),
  'ni otra extensión');
select throws_ok($$ select public.campo_registrar_evidencia(jsonb_build_object('id', 'e1400000-0000-4000-8000-0000000000e1', 'visita_id', current_setting('t.v'),
  'ruta', format('b0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000001/%s/e1400000-0000-4000-8000-0000000000e1.jpg', current_setting('t.v')),
  'sha256', repeat('a', 64), 'bytes', 1000, 'mime', 'image/jpeg', 'capturada_en', now())) $$, 'P0002', null, 'sin la foto en el almacén no hay evidencia');
reset role;
insert into storage.objects (bucket_id, name) values ('campo', format('b0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000001/%s/e1400000-0000-4000-8000-0000000000e1.jpg', current_setting('t.v')));
set local role authenticated;
select lives_ok($$ select public.campo_registrar_evidencia(jsonb_build_object('id', 'e1400000-0000-4000-8000-0000000000e1', 'visita_id', current_setting('t.v'),
  'ruta', format('b0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000001/%s/e1400000-0000-4000-8000-0000000000e1.jpg', current_setting('t.v')),
  'sha256', repeat('a', 64), 'bytes', 1000, 'mime', 'image/jpeg', 'latitud', 19.29, 'longitud', -99.65, 'precision_m', 12, 'capturada_en', now())) $$, 'registra la foto con su huella');
select lives_ok($$ select public.campo_registrar_evidencia(jsonb_build_object('id', 'e1400000-0000-4000-8000-0000000000e1', 'visita_id', current_setting('t.v'),
  'ruta', format('b0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000001/%s/e1400000-0000-4000-8000-0000000000e1.jpg', current_setting('t.v')),
  'sha256', repeat('a', 64), 'bytes', 1000, 'mime', 'image/jpeg', 'capturada_en', now())) $$, 'reenviarla no la duplica');
select throws_ok($$ select public.campo_registrar_evidencia(jsonb_build_object('id', 'e1400000-0000-4000-8000-0000000000e1', 'visita_id', current_setting('t.v'),
  'ruta', 'x', 'sha256', repeat('b', 64), 'bytes', 1000, 'mime', 'image/jpeg', 'capturada_en', now())) $$, '23505', null, 'ni se cambia su contenido');

-- Cédula
select throws_ok($$ select public.campo_guardar_cedula(jsonb_build_object('id', 'e1400000-0000-4000-8000-0000000000c1', 'visita_id', current_setting('t.v'),
  'capturada_en', now(), 'respuestas', '{"domicilio_existe":"tal vez"}'::jsonb)) $$, '23514', null, 'respuestas incompletas se rechazan');
select lives_ok($$ select set_config('t.r', public.campo_guardar_cedula(jsonb_build_object('id', 'e1400000-0000-4000-8000-0000000000c1', 'visita_id', current_setting('t.v'),
  'capturada_en', now(), 'latitud', 19.29, 'longitud', -99.65, 'precision_m', 12, 'evidencias', '["e1400000-0000-4000-8000-0000000000e1"]'::jsonb,
  'respuestas', '{"domicilio_existe":"si","inmueble_existe":"no","proveedor_presente":"no","actividad_visible":"no","persona_confirma":"no_verificable"}'::jsonb))::text, true) $$,
  'guarda la cédula');
select is(public.campo_guardar_cedula(jsonb_build_object('id', 'e1400000-0000-4000-8000-0000000000c1', 'visita_id', current_setting('t.v'),
  'capturada_en', now(), 'respuestas', '{}'::jsonb))::text, current_setting('t.r'), 'reenviarla devuelve el mismo registro');
reset role;
select is((select array[origen, estado_validacion] from public.registro where id = current_setting('t.r')::uuid),
  array['campo', 'validado'], 'la cédula es un registro de origen campo, validado por quien verificó');
select is((select estado from public.visita_campo where id = current_setting('t.v')::uuid), 'verificada', 'la visita se cierra');
select is((select cedula_id::text from public.evidencia_campo where id = 'e1400000-0000-4000-8000-0000000000e1'), 'e1400000-0000-4000-8000-0000000000c1', 'la foto queda ligada a la cédula');
select is((select count(*)::int from public.trabajo where tipo = 'reglas' and payload ->> 'encargo_id' = 'c0000000-0000-4000-8000-000000000001'), 1, 'y se piden las reglas');
select ok((select count(*) from public.bitacora where accion in ('campo.aviso', 'campo.evidencia', 'campo.cedula', 'campo.visita')) >= 4, 'todo en bitácora');

-- El lector ve el resultado; otra persona no puede verificar la visita de alguien más
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;
select is((select count(*)::int from public.cedula_campo where id = 'e1400000-0000-4000-8000-0000000000c1'), 1, 'el lector consulta la cédula');
select throws_ok($$ update public.cedula_campo set observaciones = 'x' $$, '42501', null, 'nadie edita una cédula');
select throws_ok($$ select public.campo_registrar_evidencia(jsonb_build_object('id', 'e1400000-0000-4000-8000-0000000000e9', 'visita_id', current_setting('t.v'),
  'ruta', 'x', 'sha256', repeat('a', 64), 'bytes', 1, 'mime', 'image/jpeg', 'capturada_en', now())) $$, '42501', 'la visita no está asignada a ti', 'otra persona no verifica la visita');

select throws_ok($$ select * from public.verificadores_organizacion('b0000000-0000-4000-8000-000000000001') $$, '42501', null,
  'el lector no lista a quién asignar visitas');
reset role;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select is((select array_agg(rol order by rol) from public.verificadores_organizacion('b0000000-0000-4000-8000-000000000001')),
  array['admin', 'auditor', 'verificador'], 'el auditor ve solo a quién puede asignar (sin lectores)');
reset role;

select * from finish();
rollback;
