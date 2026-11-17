-- Captura manual: registro validado sin documento, entidades, evento y asociación posterior.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

select ok(jsonb_array_length((select campos_esperados from public.tipo_documento
                               where organizacion_id = 'b0000000-0000-4000-8000-000000000001' and clave = 'contrato')) >= 4,
          'el catálogo provisional trae campos para contrato');

insert into storage.objects (bucket_id, name) values
  ('originales', 'b0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000001/' || repeat('8', 64));

create function public._prueba_captura(p_extra jsonb default '{}') returns jsonb language sql as $$
  select jsonb_build_object(
    'encargo_id', 'c0000000-0000-4000-8000-000000000001',
    'tipo_documento_id', (select id from public.tipo_documento
                           where organizacion_id = 'b0000000-0000-4000-8000-000000000001' and clave = 'contrato'),
    'expediente_id', null, 'fuente', 'Entrevista', 'fecha_documento', '2022-03-15',
    'resumen', 'Contrato C-1 (captura manual)',
    'campos', jsonb_build_array(
      jsonb_build_object('campo', 'numero_contrato', 'valor_crudo', 'C-1', 'valor_normalizado', 'C-1'),
      jsonb_build_object('campo', 'involucrado_1', 'valor_crudo', 'SECRETARIA X', 'valor_normalizado', '{}'::jsonb),
      jsonb_build_object('campo', 'involucrado_2', 'valor_crudo', 'CAPTURA SA', 'valor_normalizado', '{}'::jsonb)),
    'involucrados', jsonb_build_array(
      jsonb_build_object('tipo', 'dependencia', 'nombre', 'Secretaría X', 'nombre_normalizado', 'SECRETARIA X',
                         'rol', 'dependencia', 'identificadores', '{}'::jsonb),
      jsonb_build_object('tipo', 'persona_moral', 'nombre', 'Captura SA de CV', 'nombre_normalizado', 'CAPTURA',
                         'rol', 'proveedor', 'identificadores', jsonb_build_object('rfc', 'CAP200101AB1'))),
    'evento', jsonb_build_object('tipo', 'contrato', 'fecha_hora', '2022-03-15T00:00:00-06:00',
      'monto', '1500000.00', 'moneda', 'MXN', 'atributos', jsonb_build_object('numero', 'C-1'),
      'participantes', jsonb_build_array(jsonb_build_object('indice', 0, 'rol', 'origen'),
                                         jsonb_build_object('indice', 1, 'rol', 'destino')))
  ) || p_extra;
$$;
grant execute on function public._prueba_captura(jsonb) to authenticated;

set local role authenticated;

-- Lector no captura.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$ select public.capturar_registro(public._prueba_captura()) $$, '42501', null, 'lector no captura');

-- Auditor captura.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select public.capturar_registro(public._prueba_captura('{"fuente":""}')) $$, '22023', null,
                 'sin fuente declarada no se captura');
select lives_ok($$ select public.capturar_registro(public._prueba_captura()) $$, 'auditor captura un contrato');
select is((select origen || '/' || estado_validacion || '/' || coalesce(documento_id::text, 'sin documento')
             from public.registro where resumen = 'Contrato C-1 (captura manual)'),
          'captura/validado/sin documento', 'registro de captura, validado y sin soporte documental');
select is((select count(*) from public.extraccion x join public.registro r on r.id = x.registro_id
            where r.resumen = 'Contrato C-1 (captura manual)' and x.metodo = 'manual' and x.estado = 'validado'
              and x.confianza is null and x.validado_por = 'a0000000-0000-4000-8000-000000000002'),
          3::bigint, 'extracciones manuales validadas por quien captura, sin confianza');
select is((select count(*) from public.entidad where nombre_normalizado in ('SECRETARIA X', 'CAPTURA')), 2::bigint, 'entidades creadas');
select is((select count(*) from public.registro_entidad re join public.registro r on r.id = re.registro_id
            where r.resumen = 'Contrato C-1 (captura manual)'), 2::bigint, 'involucrados con rol');
select is((select string_agg(p.rol, ',' order by p.rol) from public.evento_participante p
            join public.evento e on e.id = p.evento_id where e.atributos ->> 'numero' = 'C-1'),
          'destino,origen', 'evento de contrato con sus dos partes');
select is((select count(*) from public.evidencia ev join public.registro r on r.id = ev.registro_id
            where r.resumen = 'Contrato C-1 (captura manual)'), 3::bigint, 'todo apunta al registro (regla 1)');

-- Una segunda captura reutiliza las entidades (mismo RFC, aunque cambie el nombre).
select lives_ok($$ select public.capturar_registro(public._prueba_captura(
  '{"resumen":"Contrato C-2 (captura manual)","evento":null}'::jsonb)) $$, 'segunda captura');
select is((select count(*) from public.entidad where nombre_normalizado in ('SECRETARIA X', 'CAPTURA')), 2::bigint,
          'las entidades no se duplican');

-- Asociar documento: deja de estar sin soporte y encola la extracción.
select throws_ok($$ select public.asociar_documento(jsonb_build_object(
  'registro_id', (select id from public.registro where resumen = 'Contrato C-1 (captura manual)'),
  'sha256', repeat('9', 64), 'nombre_archivo', 'c1.pdf', 'mime', 'application/pdf', 'tamano', 10)) $$,
  'P0002', null, 'sin original en el almacenamiento no se asocia');
select lives_ok($$ select public.asociar_documento(jsonb_build_object(
  'registro_id', (select id from public.registro where resumen = 'Contrato C-1 (captura manual)'),
  'sha256', repeat('8', 64), 'nombre_archivo', 'c1.pdf', 'mime', 'application/pdf', 'tamano', 10)) $$,
  'auditor asocia un documento');
select is((select origen || '/' || estado_extraccion || '/' || (documento_id is not null)::text
             from public.registro where resumen = 'Contrato C-1 (captura manual)'),
          'captura/en_cola/true', 'el registro conserva su origen y ya tiene documento');
select is((select count(*) from public.trabajo where payload ->> 'comparar_con_captura' = 'true'), 1::bigint,
          'trabajo de extracción encolado');
select throws_ok($$ select public.asociar_documento(jsonb_build_object(
  'registro_id', (select id from public.registro where resumen = 'Contrato C-1 (captura manual)'),
  'sha256', repeat('8', 64), 'nombre_archivo', 'c1.pdf', 'mime', 'application/pdf', 'tamano', 10)) $$,
  '22023', null, 'no se asocia dos veces');

reset role;
select * from finish();
rollback;
