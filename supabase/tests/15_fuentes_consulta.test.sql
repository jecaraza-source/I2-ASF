-- Ficha enriquecida: cargas de la lista 69-B, resultados de consulta y aislamiento.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- Otra organización con su propio usuario: sus fuentes nacen solas.
insert into auth.users (id, email) values ('a0000000-0000-4000-8000-0000000000bb', 'otra@org.test');
insert into public.organizacion (id, nombre) values ('b0000000-0000-4000-8000-0000000000bb', 'Otra organización');
insert into public.miembro (organizacion_id, usuario_id, rol)
values ('b0000000-0000-4000-8000-0000000000bb', 'a0000000-0000-4000-8000-0000000000bb', 'admin');
select is((select count(*) from public.fuente_consulta where organizacion_id = 'b0000000-0000-4000-8000-0000000000bb'),
          2::bigint, 'una organización nueva nace con sus dos fuentes');

create function pg_temp.fuente(p_conector text) returns uuid language sql as $$
  select id from public.fuente_consulta
   where organizacion_id = 'b0000000-0000-4000-8000-000000000001' and conector = p_conector $$;
create function pg_temp.fila(p_rfc text, p_nombre text, p_situacion text) returns jsonb language sql as $$
  select jsonb_build_object('rfc', p_rfc, 'nombre', p_nombre, 'nombre_normalizado', upper(p_nombre),
                            'situacion', p_situacion, 'datos', '{}'::jsonb) $$;

set local role authenticated;

-- Auditor: no carga listas.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select public.iniciar_carga_fuente(jsonb_build_object('fuente_id', pg_temp.fuente('lista_69b'),
  'nombre_archivo', 'x.csv', 'formato', 'csv', 'sha256', repeat('a', 64), 'filas_esperadas', 1)) $$,
  '42501', null, 'auditor no carga la lista 69-B');

-- Admin: dos cargas; la segunda reemplaza a la primera.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select throws_ok($$ select public.iniciar_carga_fuente(jsonb_build_object('fuente_id', pg_temp.fuente('otros_expedientes'),
  'nombre_archivo', 'x.csv', 'formato', 'csv', 'sha256', repeat('a', 64), 'filas_esperadas', 1)) $$,
  '22023', null, 'solo la lista admite cargas');
create temporary table t_carga (n int, id uuid) on commit drop;
grant all on t_carga to authenticated;
insert into t_carga select 1, public.iniciar_carga_fuente(jsonb_build_object('fuente_id', pg_temp.fuente('lista_69b'),
  'nombre_archivo', 'lista-1.csv', 'formato', 'csv', 'sha256', repeat('a', 64), 'filas_esperadas', 3));
select throws_ok($$ select public.cerrar_carga_fuente((select id from t_carga where n = 1)) $$, '22023', null,
                 'una carga sin filas no se cierra');
select is(public.agregar_lote_69b((select id from t_carga where n = 1), jsonb_build_array(
  pg_temp.fila('AAA010101AA1', 'Empresa Presunta', 'presunto'),
  pg_temp.fila('AAA010101AA1', 'Repetida', 'presunto'),
  pg_temp.fila('BBB020202BB2', 'Empresa Desvirtuada', 'desvirtuado'))), 2, 'un RFC repetido se ignora');
select throws_ok($$ select public.agregar_lote_69b((select id from t_carga where n = 1),
  jsonb_build_array(pg_temp.fila('NO-ES-RFC', 'X', 'presunto'))) $$, '23514', null, 'la base exige RFC válido');
select is(public.cerrar_carga_fuente((select id from t_carga where n = 1)), 2, 'la carga se cierra con sus filas');
insert into t_carga select 2, public.iniciar_carga_fuente(jsonb_build_object('fuente_id', pg_temp.fuente('lista_69b'),
  'nombre_archivo', 'lista-2.xlsx', 'formato', 'xlsx', 'sha256', repeat('b', 64), 'filas_esperadas', 1));
select public.agregar_lote_69b((select id from t_carga where n = 2),
  jsonb_build_array(pg_temp.fila('AAA010101AA1', 'Empresa Presunta', 'definitivo')));
select public.cerrar_carga_fuente((select id from t_carga where n = 2));
select results_eq($$ select estado from public.carga_fuente order by creado_en, nombre_archivo $$,
                  $$ values ('reemplazada'), ('vigente') $$, 'la carga nueva es la vigente; la anterior se conserva');
select throws_ok($$ select public.agregar_lote_69b((select id from t_carga where n = 1), '[]'::jsonb) $$,
                 '22023', null, 'una carga cerrada no recibe filas');
select is((select count(*) from public.bitacora where accion = 'fuente.carga'
             and detalle ->> 'sha256' = repeat('b', 64) and detalle ->> 'filas' = '1'), 1::bigint,
          'la carga queda en bitácora con su huella');

-- Resultados: solo el procesador los escribe.
select throws_ok($$ select public.guardar_resultados_consulta('{}'::jsonb) $$, '42501', null,
                 'los usuarios no guardan resultados');
insert into public.entidad (organizacion_id, encargo_id, tipo, nombre, nombre_normalizado, identificadores)
values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'persona_moral',
        'Empresa Presunta SA', 'EMPRESA PRESUNTA', '{"rfc":"AAA010101AA1"}');
create function pg_temp.ent() returns uuid language sql as $$
  select id from public.entidad where nombre = 'Empresa Presunta SA' $$;
select throws_ok($$ insert into public.resultado_consulta (organizacion_id, encargo_id, entidad_id, fuente_id, huella, coincidencia)
  values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', pg_temp.ent(),
          pg_temp.fuente('lista_69b'), 'x', 'exacta') $$, '42501', null, 'tampoco insertándolos directo');

reset role;
set local role service_role;
create function pg_temp.guardar(p_situacion text) returns int language sql as $$
  select public.guardar_resultados_consulta(jsonb_build_object(
    'encargo_id', 'c0000000-0000-4000-8000-000000000001', 'entidad_id', pg_temp.ent(),
    'fuente_id', pg_temp.fuente('lista_69b'), 'resultados', jsonb_build_array(
      jsonb_build_object('huella', '69b:AAA010101AA1', 'coincidencia', 'exacta',
                         'datos', jsonb_build_object('situacion', p_situacion, 'resumen', 'RFC AAA010101AA1')),
      jsonb_build_object('huella', '69b:nombre:BBB020202BB2', 'coincidencia', 'propuesta',
                         'datos', jsonb_build_object('situacion', 'desvirtuado'))))) $$;
select is(pg_temp.guardar('presunto'), 2, 'el procesador guarda resultados');
select is(pg_temp.guardar('definitivo'), 2, 'volver a consultar no duplica');
select is((select count(*) from public.resultado_consulta), 2::bigint, 'siguen siendo dos');
select is((select datos ->> 'situacion' from public.resultado_consulta where huella = '69b:AAA010101AA1'),
          'definitivo', 'y actualiza lo encontrado');
reset role;

-- Auditor: confirma y descarta; lo decidido no se reabre ni se edita.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$ update public.resultado_consulta set estado = 'descartada' where huella = '69b:nombre:BBB020202BB2' $$,
                 '23514', null, 'descartar exige motivo');
select lives_ok($$ update public.resultado_consulta set estado = 'descartada', motivo = 'Homónimo, otro RFC'
                    where huella = '69b:nombre:BBB020202BB2' $$, 'auditor descarta con motivo');
select throws_ok($$ update public.resultado_consulta set estado = 'confirmada' where huella = '69b:nombre:BBB020202BB2' $$,
                 '23514', null, 'lo descartado no se reabre');
select throws_ok($$ update public.resultado_consulta set datos = '{}' where huella = '69b:AAA010101AA1' $$,
                 '23514', null, 'lo encontrado no se edita');
select throws_ok($$ select public.incorporar_resultado_consulta((select id from public.resultado_consulta where huella = '69b:AAA010101AA1')) $$,
                 '22023', null, 'un resultado pendiente no se incorpora');
select lives_ok($$ update public.resultado_consulta set estado = 'confirmada' where huella = '69b:AAA010101AA1' $$,
                'auditor confirma');
select is((select revisado_por::text from public.resultado_consulta where huella = '69b:AAA010101AA1'),
          'a0000000-0000-4000-8000-000000000002', 'queda quién lo revisó');
select isnt(public.incorporar_resultado_consulta((select id from public.resultado_consulta where huella = '69b:AAA010101AA1')),
            null, 'lo confirmado se incorpora como registro');
select ok((select r.origen = 'captura' and r.estado_validacion = 'validado'
                  and r.fuente like 'Lista 69-B del SAT (consultada el %'
             from public.registro r join public.resultado_consulta x on x.registro_id = r.id
            where x.huella = '69b:AAA010101AA1'), 'como captura validada con la fuente declarada');
select is((select count(*) from public.registro_entidad re join public.resultado_consulta x on x.registro_id = re.registro_id
            where x.huella = '69b:AAA010101AA1' and re.entidad_id = pg_temp.ent()), 1::bigint,
          'ligado a la misma entidad');
select throws_ok($$ select public.incorporar_resultado_consulta((select id from public.resultado_consulta where huella = '69b:AAA010101AA1')) $$,
                 '22023', null, 'se incorpora una sola vez');
select results_eq($$ select accion from public.bitacora where objeto_tipo = 'resultado_consulta' order by accion $$,
                  $$ values ('consulta.confirmada'), ('consulta.descartada'), ('consulta.incorporada') $$,
                  'cada decisión queda en bitácora');

-- Encolar consultas sin duplicar.
select is(public.encolar_consulta_fuentes('c0000000-0000-4000-8000-000000000001', pg_temp.ent()),
          public.encolar_consulta_fuentes('c0000000-0000-4000-8000-000000000001', pg_temp.ent()),
          'una consulta igual en espera no se duplica');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$ select public.encolar_consulta_fuentes('c0000000-0000-4000-8000-000000000001') $$,
                 '42501', null, 'lector no encola consultas');
select is((select count(*) from public.lista_69b), 3::bigint, 'lector consulta la lista de su organización');

-- Aislamiento: la otra organización no ve nada de esta.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000bb","role":"authenticated"}', true);
select is((select count(*) from public.fuente_consulta), 2::bigint, 've solo sus fuentes');
select is((select count(*) from public.lista_69b), 0::bigint, 'ni las listas');
select is((select count(*) from public.carga_fuente), 0::bigint, 'ni las cargas');
select is((select count(*) from public.resultado_consulta), 0::bigint, 'ni los resultados');
select throws_ok($$ select public.iniciar_carga_fuente(jsonb_build_object('fuente_id', pg_temp.fuente('lista_69b'),
  'nombre_archivo', 'x.csv', 'formato', 'csv', 'sha256', repeat('c', 64), 'filas_esperadas', 1)) $$,
  'P0002', null, 'ni carga sobre la fuente de otra organización');

reset role;
select * from finish();
rollback;
