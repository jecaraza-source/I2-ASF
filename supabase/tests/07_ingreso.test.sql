-- Ingreso de documentos y procesador de trabajos.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- Dos originales ya subidos al bucket (el tercero no existe).
insert into storage.objects (bucket_id, name) values
  ('originales', 'b0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000001/' || repeat('1', 64)),
  ('originales', 'b0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000001/' || repeat('2', 64));

create function public._prueba_documento(p_sha text, p_expediente text default 'EXP-INGRESO') returns jsonb
language sql as $$
  select jsonb_build_object(
    'encargo_id', 'c0000000-0000-4000-8000-000000000001',
    'sha256', p_sha, 'nombre_archivo', 'contrato.pdf', 'mime', 'application/pdf', 'tamano', 1234,
    'tipo_documento_id', (select id from public.tipo_documento
                           where organizacion_id = 'b0000000-0000-4000-8000-000000000001' order by clave limit 1),
    'fuente', 'Entrega física', 'expediente_nuevo', p_expediente);
$$;
grant execute on function public._prueba_documento(text, text) to authenticated;

set local role authenticated;

-- Lector no ingresa documentos.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$ select public.registrar_documento(public._prueba_documento(repeat('1', 64))) $$, '42501', null,
                 'lector no registra documentos');

-- Auditor registra: documento, registro pendiente y trabajo.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok($$ select public.registrar_documento(public._prueba_documento(repeat('1', 64))) $$, 'auditor registra');
select is((select count(*) from public.documento_origen where sha256 = repeat('1', 64)), 1::bigint, 'documento creado');
select is((select origen || '/' || estado_validacion || '/' || estado_extraccion from public.registro r
            join public.documento_origen d on d.id = r.documento_id where d.sha256 = repeat('1', 64)),
          'documento/pendiente/en_cola', 'registro de documento, pendiente y en cola');
select is((select count(*) from public.trabajo where tipo = 'extraccion' and estado = 'pendiente'), 1::bigint, 'trabajo de extracción');
select is((select count(*) from public.expediente where identificador = 'EXP-INGRESO'), 1::bigint, 'expediente nuevo creado');
select is((select count(*) from public.bitacora b join public.documento_origen d on d.id = b.objeto_id
            where d.sha256 = repeat('1', 64)), 1::bigint, 'el alta queda en bitácora');

-- El mismo archivo no se registra dos veces; el segundo reutiliza el expediente nuevo.
select throws_ok($$ select public.registrar_documento(public._prueba_documento(repeat('1', 64))) $$, '23505', null,
                 'duplicado rechazado');
select lives_ok($$ select public.registrar_documento(public._prueba_documento(repeat('2', 64))) $$, 'segundo documento');
select is((select count(*) from public.expediente where identificador = 'EXP-INGRESO'), 1::bigint, 'el expediente no se duplica');

-- Sin original en el bucket, sin fuente o sin expediente no hay documento.
select throws_ok($$ select public.registrar_documento(public._prueba_documento(repeat('3', 64))) $$, 'P0002', null,
                 'sin original en el almacenamiento');
select throws_ok($$ select public.registrar_documento(public._prueba_documento(repeat('2', 64)) || '{"fuente":" "}') $$,
                 '22023', null, 'sin fuente');
select throws_ok($$ select public.registrar_documento(public._prueba_documento(repeat('2', 64), '')) $$,
                 '22023', null, 'sin expediente');

-- Los usuarios no toman ni cierran trabajos.
select throws_ok($$ select * from public.tomar_trabajos() $$, '42501', null, 'un usuario no toma trabajos');
select throws_ok($$ select public.terminar_trabajo(gen_random_uuid(), true) $$, '42501', null, 'ni los cierra');

-- Procesador (service_role).
reset role;
set local role service_role;
select is((select count(*) from public.tomar_trabajos(1)), 1::bigint, 'toma un trabajo');
select is((select count(*) from public.trabajo where estado = 'en_proceso' and intentos = 1), 1::bigint, 'queda en proceso con un intento');
select is((select count(*) from public.tomar_trabajos(10)), 1::bigint, 'el bloqueado no se vuelve a tomar; toma el otro');
select is((select count(*) from public.tomar_trabajos(10)), 0::bigint, 'no queda nada por tomar');

-- Fallo: reintento con espera; éxito: hecho. Cerrar dos veces no hace nada.
select is(public.terminar_trabajo((select id from public.trabajo order by creado_en, id limit 1), false, 'fallo'),
          'pendiente', 'un fallo lo regresa a pendiente');
select ok((select bloqueado_hasta > now() + interval '1 minute' from public.trabajo order by creado_en, id limit 1),
          'con espera antes del reintento');
select is((select count(*) from public.tomar_trabajos(10)), 0::bigint, 'no se reintenta antes de tiempo');
select is(public.terminar_trabajo((select id from public.trabajo order by creado_en, id offset 1 limit 1), true),
          'hecho', 'el otro termina bien');
select is(public.terminar_trabajo((select id from public.trabajo order by creado_en, id offset 1 limit 1), true),
          null, 'cerrarlo otra vez no hace nada');

-- Bloqueo vencido: se retoma; al tercer intento fallido queda en error.
reset role;
update public.trabajo set bloqueado_hasta = now() - interval '1 second' where estado = 'pendiente';
set local role service_role;
select is((select intentos from public.tomar_trabajos(10)), 2, 'segundo intento');
select is(public.terminar_trabajo((select id from public.trabajo where estado = 'en_proceso'), false, 'fallo'), 'pendiente', 'segundo fallo');
reset role;
update public.trabajo set bloqueado_hasta = now() - interval '1 second' where estado = 'pendiente';
set local role service_role;
select is((select intentos from public.tomar_trabajos(10)), 3, 'tercer intento');
select is(public.terminar_trabajo((select id from public.trabajo where estado = 'en_proceso'), false, 'fallo'), 'error', 'al tercer fallo queda en error');

reset role;
select * from finish();
rollback;
