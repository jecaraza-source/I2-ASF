-- importar_excel: carga completa en una transacción, con RLS del usuario.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

create function public._prueba_carga(p_sha text, p_vinculo_destino text default 'e2') returns jsonb
language sql as $$
  select jsonb_build_object(
    'organizacion_id', 'b0000000-0000-4000-8000-000000000001',
    'encargo_id', 'c0000000-0000-4000-8000-000000000001',
    'expediente_id', null,
    'fuente', 'Prueba pgTAP',
    'plantilla', 'prueba',
    'documento', jsonb_build_object(
      'sha256', p_sha,
      'storage_path', 'b0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000001/' || p_sha,
      'nombre_archivo', 'prueba.xlsx',
      'mime', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'tamano', 1024),
    'registros', jsonb_build_array(
      jsonb_build_object('clave', 'C!2', 'resumen', 'Contrato X-1', 'fecha_documento', '2022-03-15',
        'extracciones', jsonb_build_array(
          jsonb_build_object('campo', 'PROVEEDOR', 'valor_crudo', 'ACME SA DE CV', 'valor_normalizado', 'ACME SA DE CV',
                             'ubicacion', jsonb_build_object('hoja', 'C', 'fila', 2, 'celda', 'C2')),
          jsonb_build_object('campo', 'MONTO', 'valor_crudo', '1000', 'valor_normalizado', '1000.00',
                             'ubicacion', jsonb_build_object('hoja', 'C', 'fila', 2, 'celda', 'D2')))),
      jsonb_build_object('clave', 'V!2', 'resumen', 'Vínculo SOCIO', 'fecha_documento', null,
        'extracciones', jsonb_build_array(
          jsonb_build_object('campo', 'ENTIDAD_A', 'valor_crudo', 'JUAN PEREZ', 'valor_normalizado', 'JUAN PEREZ',
                             'ubicacion', jsonb_build_object('hoja', 'V', 'fila', 2, 'celda', 'A2'))))),
    'entidades', jsonb_build_array(
      jsonb_build_object('clave', 'e1', 'tipo', 'persona_moral', 'nombre', 'ACME SA DE CV', 'nombre_normalizado', 'ACME',
        'identificadores', jsonb_build_object('rfc', 'ACM220101AB1'), 'atributos', jsonb_build_object('tipos_declarados', jsonb_build_array('EMPRESA')),
        'riesgo_declarado', null,
        'apariciones', jsonb_build_array(jsonb_build_object('registro', 'C!2', 'rol', 'proveedor'),
                                         jsonb_build_object('registro', 'V!2', 'rol', 'destino'))),
      jsonb_build_object('clave', 'e2', 'tipo', 'persona_fisica', 'nombre', 'JUAN PEREZ', 'nombre_normalizado', 'JUAN PEREZ',
        'identificadores', '{}'::jsonb, 'atributos', '{}'::jsonb, 'riesgo_declarado', 'ALTO',
        'apariciones', jsonb_build_array(jsonb_build_object('registro', 'V!2', 'rol', 'origen')))),
    'vinculos', jsonb_build_array(
      jsonb_build_object('origen', 'e1', 'destino', p_vinculo_destino, 'tipo', 'SOCIO', 'fuerza', 7,
                         'fuerza_original', 'ALTO', 'fecha_inicio', null, 'dirigido', false, 'registro', 'V!2')),
    'eventos', jsonb_build_array(
      jsonb_build_object('tipo', 'contrato', 'fecha_hora', '2022-03-15T00:00:00-06:00', 'monto', '-1000.50', 'moneda', 'MXN',
        'atributos', jsonb_build_object('numero', 'X-1'),
        'participantes', jsonb_build_array(jsonb_build_object('entidad', 'e1', 'rol', 'destino')),
        'registro', 'C!2'))
  );
$$;

grant execute on function public._prueba_carga(text, text) to authenticated;

set local role authenticated;

-- Lector: no importa.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$ select public.importar_excel(public._prueba_carga(repeat('1', 64))) $$,
  '42501', null, 'lector no puede importar'
);

-- Auditor: la carga completa queda trazable.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$ select public.importar_excel(public._prueba_carga(repeat('a', 64))) $$,
  'auditor importa'
);

select is((select count(*) from public.registro r join public.documento_origen d on d.id = r.documento_id
            where d.sha256 = repeat('a', 64) and r.origen = 'importacion' and r.estado_validacion = 'validado'),
          2::bigint, 'un registro por fila, validados');
select is((select count(*) from public.extraccion x join public.registro r on r.id = x.registro_id
            join public.documento_origen d on d.id = r.documento_id
           where d.sha256 = repeat('a', 64) and x.metodo = 'importacion' and x.ubicacion ? 'celda'),
          3::bigint, 'cada extracción conserva su celda de origen');
select is((select monto from public.evento where atributos ->> 'numero' = 'X-1'), -1000.50::numeric(18, 2),
          'el monto conserva el signo');
select is((select count(*) from public.vinculo where tipo = 'SOCIO' and fuerza = 7), 1::bigint, 'vínculo creado');
select is((select count(*) from public.evidencia ev join public.vinculo v on v.id = ev.objeto_id
            where ev.objeto_tipo = 'vinculo' and v.tipo = 'SOCIO'), 1::bigint, 'el vínculo apunta a su registro');
select is((select count(*) from public.evidencia ev join public.entidad e on e.id = ev.objeto_id
            where ev.objeto_tipo = 'entidad' and e.nombre_normalizado = 'ACME'), 2::bigint,
          'la entidad apunta a cada registro donde aparece');
select is((select count(*) from public.bitacora where accion = 'importacion.carga'
            and actor = 'a0000000-0000-4000-8000-000000000002'), 1::bigint, 'la carga queda en bitácora');
select is((select contratos from public.importacion_resumen where sha256 = repeat('a', 64)), 1::bigint,
          'el resumen cuenta el contrato');

-- Mismo archivo otra vez: se rechaza por hash.
select throws_ok(
  $$ select public.importar_excel(public._prueba_carga(repeat('a', 64))) $$,
  '23505', null, 'el mismo archivo no se importa dos veces'
);

-- Otro archivo con la misma empresa (mismo RFC): se reutiliza la entidad.
select lives_ok(
  $$ select public.importar_excel(public._prueba_carga(repeat('b', 64))) $$,
  'segundo archivo con las mismas entidades'
);
select is((select count(*) from public.entidad where nombre_normalizado = 'ACME'), 1::bigint,
          'la entidad se resuelve por RFC entre archivos');
select is((select count(*) from public.entidad where nombre_normalizado = 'JUAN PEREZ'), 1::bigint,
          'y por nombre normalizado si no hay identificador');

-- Si algo falla a medias, no queda nada.
select throws_ok(
  $$ select public.importar_excel(public._prueba_carga(repeat('c', 64), 'e9')) $$,
  '23502', null, 'un vínculo a una entidad inexistente aborta la carga'
);
select is((select count(*) from public.documento_origen where sha256 = repeat('c', 64)), 0::bigint,
          'la carga fallida no deja documento');
select is((select count(*) from public.registro r where r.fuente = 'Prueba pgTAP'
            and r.documento_id not in (select id from public.documento_origen where sha256 in (repeat('a', 64), repeat('b', 64)))),
          0::bigint, 'ni registros');

reset role;
select * from finish();
rollback;
