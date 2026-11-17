-- Expediente documental: tabla con filtros, búsqueda y orden; árbol con conteos iguales a la tabla.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into auth.users (id, email) values ('a0000000-0000-4000-8000-0000000000ff', 'ajeno@sigma.test');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

insert into public.expediente (organizacion_id, encargo_id, identificador) values
  ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'EXP-DOC-A'),
  ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'EXP-DOC-B');

create function pg_temp.tipo(p_clave text) returns uuid language sql as $$
  select id from public.tipo_documento
   where organizacion_id = 'b0000000-0000-4000-8000-000000000001' and clave = p_clave $$;
create function pg_temp.exp(p_id text) returns uuid language sql as $$
  select id from public.expediente where identificador = p_id $$;
create function pg_temp.inv(p_tipo text, p_nombre text, p_rol text, p_rfc text default null) returns jsonb
  language sql as $$
  select jsonb_build_object('tipo', p_tipo, 'nombre', p_nombre, 'nombre_normalizado', upper(p_nombre),
                            'rol', p_rol, 'identificadores',
                            case when p_rfc is null then '{}'::jsonb else jsonb_build_object('rfc', p_rfc) end) $$;

-- R1: contrato en EXP-DOC-A con monto y número; R2: contrato en EXP-DOC-B; R3: CFDI sin expediente.
select public.capturar_registro(jsonb_build_object(
  'encargo_id', 'c0000000-0000-4000-8000-000000000001', 'tipo_documento_id', pg_temp.tipo('contrato'),
  'expediente_id', pg_temp.exp('EXP-DOC-A'), 'fuente', 'Oficio de la dependencia', 'fecha_documento', '2022-01-10',
  'resumen', 'Contrato C-1 de obra pública',
  'campos', jsonb_build_array(
    jsonb_build_object('campo', 'numero_contrato', 'valor_crudo', 'C-1', 'valor_normalizado', 'C-1'),
    jsonb_build_object('campo', 'monto', 'valor_crudo', '$1,000.00',
                       'valor_normalizado', jsonb_build_object('monto', '1000.00', 'moneda', 'MXN'))),
  'involucrados', jsonb_build_array(
    pg_temp.inv('persona_moral', 'Constructora Árbol', 'proveedor', 'CAR200101AB1'),
    pg_temp.inv('dependencia', 'Secretaría Uno', 'dependencia')),
  'evento', null));
select public.capturar_registro(jsonb_build_object(
  'encargo_id', 'c0000000-0000-4000-8000-000000000001', 'tipo_documento_id', pg_temp.tipo('contrato'),
  'expediente_id', pg_temp.exp('EXP-DOC-B'), 'fuente', 'Entrevista', 'fecha_documento', '2022-02-10',
  'resumen', 'Contrato C-2', 'campos', '[]'::jsonb,
  'involucrados', jsonb_build_array(
    pg_temp.inv('persona_moral', 'Constructora Árbol', 'proveedor', 'CAR200101AB1'),
    pg_temp.inv('dependencia', 'Secretaría Dos', 'dependencia')),
  'evento', null));
select public.capturar_registro(jsonb_build_object(
  'encargo_id', 'c0000000-0000-4000-8000-000000000001', 'tipo_documento_id', pg_temp.tipo('cfdi'),
  'fuente', 'Portal del SAT', 'fecha_documento', '2022-03-01', 'resumen', 'Factura F-9',
  'campos', jsonb_build_array(
    jsonb_build_object('campo', 'numero_factura', 'valor_crudo', 'F-9', 'valor_normalizado', 'F-9')),
  'involucrados', jsonb_build_array(pg_temp.inv('persona_moral', 'Constructora Árbol', 'proveedor', 'CAR200101AB1')),
  'evento', null));

create function pg_temp.total(p jsonb) returns bigint language sql as $$
  select coalesce(max(total), 0) from public.expediente_registros(
    jsonb_build_object('encargo_id', 'c0000000-0000-4000-8000-000000000001') || p) $$;
create function pg_temp.proveedor() returns text language sql as $$
  select coalesce(e.fusionada_en, e.id)::text from public.entidad e where e.nombre = 'Constructora Árbol' limit 1 $$;
create function pg_temp.contractual() returns text language sql as $$
  select id::text from public.categoria_documental
   where organizacion_id = 'b0000000-0000-4000-8000-000000000001' and nombre = 'Contractual' $$;

select is(pg_temp.total('{}'), 3::bigint, 'la tabla del encargo trae los tres registros');
select is(pg_temp.total(jsonb_build_object('expediente_id', pg_temp.exp('EXP-DOC-A'))), 1::bigint,
          'por expediente');
select is(pg_temp.total('{"expediente_id":"sin"}'), 1::bigint, 'los registros sin expediente se pueden pedir aparte');
select is(pg_temp.total(jsonb_build_object('entidad_id', pg_temp.proveedor())), 3::bigint,
          'por entidad: sus registros en todos los expedientes del encargo');
select is(pg_temp.total(jsonb_build_object('entidad_id', pg_temp.proveedor(), 'categoria_id', pg_temp.contractual())),
          2::bigint, 'por entidad y categoría');
select is(pg_temp.total('{"categoria_id":"sin"}'), 0::bigint, 'ninguno sin categoría');
select is(pg_temp.total('{"q":"c-1"}'), 1::bigint, 'busca por referencia');
-- Los IDs internos no se buscan: un fragmento de UUID de una entidad no debe coincidir.
select is(pg_temp.total(jsonb_build_object('q', substr(pg_temp.proveedor(), 10, 6))), 0::bigint,
          'no busca en IDs internos');
select is(pg_temp.total('{"q":"arbol secretaria uno"}'), 1::bigint,
          'busca sin acentos y exige todos los términos');
select is(pg_temp.total('{"q":"CAR200101AB1"}'), 3::bigint, 'busca por RFC');
select is(pg_temp.total('{"desde":"2022-02-01","hasta":"2022-02-28"}'), 1::bigint, 'filtra por fechas');
select is(pg_temp.total('{"estado":"validados"}'), 3::bigint, 'filtra por estado de validación');
select is(pg_temp.total('{"origen":"documento"}'), 0::bigint, 'filtra por origen');

select is((select array_agg(resumen) from public.expediente_registros(jsonb_build_object(
            'encargo_id', 'c0000000-0000-4000-8000-000000000001', 'orden', 'fecha', 'dir', 'asc'))),
          array['Contrato C-1 de obra pública', 'Contrato C-2', 'Factura F-9'], 'ordena por fecha');
select is((select array_agg(resumen) from public.expediente_registros(jsonb_build_object(
            'encargo_id', 'c0000000-0000-4000-8000-000000000001', 'orden', 'fecha', 'limite', 1, 'desplazamiento', 1))),
          array['Contrato C-2'], 'pagina');
select is((select referencias::text || ' ' || montos::text || ' ' || jsonb_array_length(involucrados)::text
                  || ' ' || identificadores::text || ' ' || categoria || ' ' || expediente
             from public.expediente_registros(jsonb_build_object(
               'encargo_id', 'c0000000-0000-4000-8000-000000000001', 'q', 'c-1'))),
          '{C-1} [{"monto": "1000.00", "moneda": "MXN"}] 2 [{"tipo": "rfc", "valor": "CAR200101AB1"}] Contractual EXP-DOC-A',
          'cada fila trae referencias, montos, involucrados, identificadores, categoría y expediente');
select is((select count(*) from public.expediente_registros(jsonb_build_object(
            'encargo_id', 'c0000000-0000-4000-8000-000000000001')) where nivel is null), 3::bigint,
          'sin red generada no hay calificación');

-- Árbol: cada nodo cuenta lo mismo que la tabla con sus filtros.
-- R4: un oficio sin entidades (como una fila de Excel que no menciona a nadie).
select public.capturar_registro(jsonb_build_object(
  'encargo_id', 'c0000000-0000-4000-8000-000000000001', 'tipo_documento_id', pg_temp.tipo('oficio'),
  'fuente', 'Archivo', 'fecha_documento', '2022-04-01', 'resumen', 'Oficio sin involucrados',
  'campos', jsonb_build_array(jsonb_build_object('campo', 'numero_expediente', 'valor_crudo', 'X-1', 'valor_normalizado', 'X-1')),
  'involucrados', '[]'::jsonb, 'evento', null));
select is(pg_temp.total('{"entidad_id":"sin"}'), 1::bigint, 'los registros sin entidades se pueden pedir aparte');
select is((select count(*) from public.expediente_arbol(jsonb_build_object(
            'encargo_id', 'c0000000-0000-4000-8000-000000000001')) where nivel = 1), 3::bigint,
          'tres nodos de expediente (A, B y sin expediente)');
select is((select count(*) from public.expediente_arbol(jsonb_build_object(
            'encargo_id', 'c0000000-0000-4000-8000-000000000001')) a
           where a.registros <> pg_temp.total(jsonb_strip_nulls(jsonb_build_object(
             'expediente_id', coalesce(a.expediente_id::text, 'sin'),
             'entidad_id', case when a.nivel >= 2 then coalesce(a.entidad_id::text, 'sin') end,
             'categoria_id', case when a.nivel = 3 then coalesce(a.categoria_id::text, 'sin') end)))),
          0::bigint, 'los conteos del árbol coinciden con la tabla');
select is((select registros from public.expediente_arbol(jsonb_build_object(
            'encargo_id', 'c0000000-0000-4000-8000-000000000001', 'q', 'f-9'))
           where nivel = 1 and expediente_id is null), 1::bigint, 'el árbol respeta la búsqueda');

-- Bitácora del registro: con el correo de quien actuó.
insert into public.bitacora (organizacion_id, encargo_id, actor, accion, objeto_tipo, objeto_id)
select organizacion_id, encargo_id, 'a0000000-0000-4000-8000-000000000002', 'registro.exportacion', 'registro', id
  from public.registro where resumen = 'Contrato C-2';
select is((select accion || ' ' || actor_correo from public.bitacora_registro(
            (select id from public.registro where resumen = 'Contrato C-2'))
           where accion = 'registro.exportacion'),
          'registro.exportacion auditor@sigma.test', 'la bitácora del registro muestra quién actuó');

-- Permisos: el lector consulta; alguien ajeno no ve nada; sin sesión no hay acceso.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is(pg_temp.total('{}'), 4::bigint, 'el lector consulta el expediente');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000ff","role":"authenticated"}', true);
select is(pg_temp.total('{}'), 0::bigint, 'un usuario de otra organización no ve registros');
select is((select count(*) from public.expediente_arbol(jsonb_build_object(
            'encargo_id', 'c0000000-0000-4000-8000-000000000001'))), 0::bigint, 'ni el árbol');
select throws_ok($$ select * from public.bitacora_registro((select id from public.registro limit 1)) $$,
                 'P0002', null, 'ni la bitácora de un registro ajeno');
reset role;
set local role anon;
select throws_ok($$ select * from public.expediente_registros('{}'::jsonb) $$, '42501', null,
                 'sin sesión no hay acceso');

reset role;
select * from finish();
rollback;
