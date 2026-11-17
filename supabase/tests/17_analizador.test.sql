-- Analizador: solo registros validados del alcance; toda afirmación cita; versiones inmutables;
-- hallazgos redactados y firmados por personas.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- Datos: un expediente con dos registros validados y uno pendiente; otro expediente aparte.
insert into public.expediente (id, organizacion_id, encargo_id, identificador)
values ('e1500000-0000-4000-8000-0000000000e1', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'EXP-AN-1'),
       ('e1500000-0000-4000-8000-0000000000e2', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'EXP-AN-2');
insert into public.registro (id, organizacion_id, encargo_id, expediente_id, origen, fuente, estado_validacion, resumen)
values ('e1500000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'e1500000-0000-4000-8000-0000000000e1', 'captura', 'Oficio', 'validado', 'Uno'),
       ('e1500000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'e1500000-0000-4000-8000-0000000000e1', 'captura', 'Oficio', 'corregido', 'Dos'),
       ('e1500000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'e1500000-0000-4000-8000-0000000000e1', 'captura', 'Oficio', 'pendiente', 'Tres'),
       ('e1500000-0000-4000-8000-000000000004', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'e1500000-0000-4000-8000-0000000000e2', 'captura', 'Oficio', 'validado', 'Cuatro');

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;

-- Alcance
select throws_ok($$ select public.crear_sintesis('{"encargo_id":"c0000000-0000-4000-8000-000000000001","alcance_tipo":"expediente","alcance_id":"e1500000-0000-4000-8000-0000000000e1","registros":["e1500000-0000-4000-8000-000000000001","e1500000-0000-4000-8000-000000000003"]}') $$,
  '23514', 'solo entran registros validados del alcance', 'un registro sin validar no entra al alcance');
select throws_ok($$ select public.crear_sintesis('{"encargo_id":"c0000000-0000-4000-8000-000000000001","alcance_tipo":"expediente","alcance_id":"e1500000-0000-4000-8000-0000000000e1","registros":["e1500000-0000-4000-8000-000000000004"]}') $$,
  '23514', 'solo entran registros validados del alcance', 'ni uno de otro expediente');
select lives_ok($$ select set_config('t.s', public.crear_sintesis('{"encargo_id":"c0000000-0000-4000-8000-000000000001","alcance_tipo":"expediente","alcance_id":"e1500000-0000-4000-8000-0000000000e1","registros":["e1500000-0000-4000-8000-000000000001","e1500000-0000-4000-8000-000000000002"]}')::text, true) $$,
  'el auditor crea una síntesis con dos registros validados');
select is((select count(*) from public.trabajo where tipo = 'sintesis' and payload ->> 'sintesis_id' = current_setting('t.s')), 1::bigint, 'y su generación queda en cola');
select throws_ok($$ insert into public.afirmacion (organizacion_id, encargo_id, sintesis_id, version, orden, texto, registros)
  values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', current_setting('t.s')::uuid, 'ia', 1, 'x', '{e1500000-0000-4000-8000-000000000001}') $$,
  '42501', null, 'el auditor no escribe la versión de la IA');

-- Lo que devuelve la IA (procesador)
reset role;
set local role service_role;
select lives_ok($$ select public.guardar_sintesis_ia(jsonb_build_object('sintesis_id', current_setting('t.s'), 'proveedor', 'anthropic', 'modelo', 'simulado',
  'afirmaciones', '[{"texto":"Afirmación uno","registros":["e1500000-0000-4000-8000-000000000001"]},{"texto":"Afirmación dos","registros":["e1500000-0000-4000-8000-000000000002","e1500000-0000-4000-8000-000000000001"]}]'::jsonb)) $$,
  'el procesador guarda la versión de la IA');
select throws_ok($$ insert into public.afirmacion (organizacion_id, encargo_id, sintesis_id, version, orden, texto, registros)
  values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', current_setting('t.s')::uuid, 'borrador', 9, 'x', '{e1500000-0000-4000-8000-000000000004}') $$,
  '23514', 'la afirmación cita registros fuera del alcance', 'ni siquiera el procesador cita fuera del alcance');
select throws_ok($$ insert into public.afirmacion (organizacion_id, encargo_id, sintesis_id, version, orden, texto, registros)
  values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', current_setting('t.s')::uuid, 'borrador', 9, 'x', '{}') $$,
  '23514', null, 'una afirmación sin registro no se guarda');
reset role;
select is((select array[count(*) filter (where version = 'ia'), count(*) filter (where version = 'borrador')]::int[]
             from public.afirmacion where sintesis_id = current_setting('t.s')::uuid), array[2, 2], 'nace como borrador, con la versión de la IA aparte');
select is((select estado from public.sintesis where id = current_setting('t.s')::uuid), 'borrador', 'estado borrador');

-- Edición: quitar un registro del alcance quita sus afirmaciones
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select set_config('request.path', '/entidad', true);
select throws_ok($$ update public.sintesis set estado = 'aprobada' where id = current_setting('t.s')::uuid $$,
  '42501', null, 'no se aprueba por la API directa');
select set_config('request.path', '', true);
select throws_ok($$ select public.guardar_borrador_sintesis(current_setting('t.s')::uuid,
  '[{"texto":"Afirmación uno","registros":["e1500000-0000-4000-8000-000000000001"]}]'::jsonb,
  '{e1500000-0000-4000-8000-000000000002}') $$, '23514', 'la afirmación cita registros fuera del alcance',
  'una cita a un registro que salió del alcance se rechaza');
select lives_ok($$ select public.guardar_borrador_sintesis(current_setting('t.s')::uuid,
  '[{"texto":"Afirmación dos, revisada","registros":["e1500000-0000-4000-8000-000000000002"]}]'::jsonb,
  '{e1500000-0000-4000-8000-000000000002}') $$, 'reducir el alcance y guardar el borrador');
select throws_ok($$ select public.guardar_borrador_sintesis(current_setting('t.s')::uuid, '[]'::jsonb,
  '{e1500000-0000-4000-8000-000000000001,e1500000-0000-4000-8000-000000000002}') $$, '23514', 'el alcance solo se puede reducir',
  'el alcance no se amplía');
select throws_ok($$ delete from public.afirmacion where sintesis_id = current_setting('t.s')::uuid and version = 'ia' $$,
  '23514', 'solo se reemplaza el borrador', 'la versión de la IA no se borra');

-- Aprobación
select lives_ok($$ select public.guardar_borrador_sintesis(current_setting('t.s')::uuid,
  '[{"texto":"Afirmación dos, aprobada","registros":["e1500000-0000-4000-8000-000000000002"]}]'::jsonb, null, true) $$,
  'el auditor aprueba');
select is((select array[estado, (aprobada_por)::text] from public.sintesis where id = current_setting('t.s')::uuid),
  array['aprobada', 'a0000000-0000-4000-8000-000000000002'], 'queda aprobada con su autor');
select is((select texto from public.afirmacion where sintesis_id = current_setting('t.s')::uuid and version = 'aprobada'),
  'Afirmación dos, aprobada', 'la versión aprobada se guarda');
select is((select count(*) from public.afirmacion where sintesis_id = current_setting('t.s')::uuid and version = 'ia'), 2::bigint,
  'la versión de la IA se conserva');
select throws_ok($$ select public.guardar_borrador_sintesis(current_setting('t.s')::uuid, '[]'::jsonb) $$, '23514',
  'la síntesis no está en borrador', 'aprobada ya no cambia');
select throws_ok($$ update public.afirmacion set texto = 'x' where sintesis_id = current_setting('t.s')::uuid $$, '42501', null,
  'ninguna afirmación se edita en su lugar');
reset role;
select ok((select count(*) from public.bitacora where objeto_id = current_setting('t.s')::uuid
            and accion in ('sintesis.alta', 'sintesis.borrador', 'sintesis.alcance', 'sintesis.aprobada')) >= 4,
          'alta, generación, cambio de alcance y aprobación en bitácora');

-- Hallazgos
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select throws_ok($$ select public.crear_hallazgo('{"encargo_id":"c0000000-0000-4000-8000-000000000001","redaccion":"corta"}') $$,
  '23514', null, 'el hallazgo lo redacta el auditor (sin texto no hay hallazgo)');
select lives_ok($$ select set_config('t.h', public.crear_hallazgo(jsonb_build_object('encargo_id', 'c0000000-0000-4000-8000-000000000001',
  'redaccion', 'Pagos sin soporte documental en el expediente EXP-AN-1.', 'sintesis_id', current_setting('t.s')))::text, true) $$,
  'crea un hallazgo con la síntesis aprobada adjunta');
select is((select count(*) from public.hallazgo_sintesis where hallazgo_id = current_setting('t.h')::uuid), 1::bigint, 'queda adjunta');
select lives_ok($$ update public.hallazgo set firmado_en = now() where id = current_setting('t.h')::uuid $$, 'el auditor firma');
select is((select firmado_por::text from public.hallazgo where id = current_setting('t.h')::uuid),
  'a0000000-0000-4000-8000-000000000002', 'firmado por quien firma');
select throws_ok($$ update public.hallazgo set redaccion = 'Otra redacción del hallazgo firmado' where id = current_setting('t.h')::uuid $$,
  '23514', 'el hallazgo ya está firmado', 'un hallazgo firmado no cambia');

-- Lector
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$ select public.crear_sintesis('{"encargo_id":"c0000000-0000-4000-8000-000000000001","alcance_tipo":"expediente","alcance_id":"e1500000-0000-4000-8000-0000000000e1","registros":["e1500000-0000-4000-8000-000000000001"]}') $$,
  '42501', null, 'el lector no genera síntesis');
select ok((select count(*) from public.sintesis where id = current_setting('t.s')::uuid) = 1, 'pero sí las consulta');
select throws_ok($$ select public.crear_hallazgo('{"encargo_id":"c0000000-0000-4000-8000-000000000001","redaccion":"Redacción suficientemente larga para pasar"}') $$,
  '42501', null, 'ni crea hallazgos');

select * from finish();
rollback;
