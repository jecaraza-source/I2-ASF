-- Red: guardar generaciones, resolver fusiones y versionar reglas.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into public.entidad (id, organizacion_id, encargo_id, tipo, nombre, nombre_normalizado) values
  ('e0000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'persona_fisica', 'CARLOS MENDOZA RÍOS', 'CARLOS MENDOZA RIOS'),
  ('e0000000-0000-4000-8000-00000000000b', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'persona_fisica', 'CARLOS MENDOZA RÍOS (PERSONAL)', 'CARLOS MENDOZA RIOS (PERSONAL)'),
  ('e0000000-0000-4000-8000-00000000000c', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'persona_moral', 'GRUPO AVAL', 'GRUPO AVAL');
insert into public.vinculo (id, organizacion_id, encargo_id, origen_id, destino_id, tipo, fuerza) values
  ('f0000000-0000-4000-8000-00000000000a', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
   'e0000000-0000-4000-8000-00000000000a', 'e0000000-0000-4000-8000-00000000000c', 'SOCIO', 9);

create function public._prueba_red() returns jsonb language sql as $$
  select jsonb_build_object(
    'organizacion_id', 'b0000000-0000-4000-8000-000000000001',
    'encargo_id', 'c0000000-0000-4000-8000-000000000001',
    'semillas', jsonb_build_array('e0000000-0000-4000-8000-00000000000a'),
    'alcance', 1,
    'version_reglas', 1,
    'resumen', jsonb_build_object('nodos', 2, 'vinculos', 1),
    'nodos', jsonb_build_array(
      jsonb_build_object('entidad_id', 'e0000000-0000-4000-8000-00000000000a', 'distancia', 0),
      jsonb_build_object('entidad_id', 'e0000000-0000-4000-8000-00000000000c', 'distancia', 1)),
    'vinculos', jsonb_build_array('f0000000-0000-4000-8000-00000000000a'),
    'calificaciones', jsonb_build_array(
      jsonb_build_object('objeto_tipo', 'entidad', 'objeto_id', 'e0000000-0000-4000-8000-00000000000a',
        'puntaje', 40, 'nivel', 'medio',
        'criterios', jsonb_build_array(jsonb_build_object('criterio', 'riesgo_declarado', 'aporte', 40, 'detalle', 'Riesgo ALTO'))),
      jsonb_build_object('objeto_tipo', 'vinculo', 'objeto_id', 'f0000000-0000-4000-8000-00000000000a',
        'puntaje', 72, 'nivel', 'alto', 'criterios', '[]'::jsonb)),
    'fusiones', jsonb_build_array(
      jsonb_build_object('entidad_a', 'e0000000-0000-4000-8000-00000000000a',
                         'entidad_b', 'e0000000-0000-4000-8000-00000000000b', 'motivo', 'Mismo nombre sin paréntesis'))
  );
$$;
grant execute on function public._prueba_red() to authenticated;

set local role authenticated;

-- Lector no genera.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$ select public.guardar_red(public._prueba_red()) $$, '42501', null, 'lector no genera redes');

-- Auditor genera.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok($$ select public.guardar_red(public._prueba_red()) $$, 'auditor genera una red');
select is((select count(*) from public.red_nodo), 2::bigint, 'nodos guardados');
select is((select count(*) from public.red_vinculo), 1::bigint, 'vínculos guardados');
select is((select count(*) from public.calificacion), 2::bigint, 'calificaciones guardadas');
select is((select criterios -> 0 ->> 'criterio' from public.calificacion where objeto_tipo = 'entidad'),
          'riesgo_declarado', 'la calificación conserva sus criterios');
select is((select count(*) from public.bitacora where accion = 'red.generada'), 1::bigint, 'la generación queda en bitácora');

-- Regenerar crea otra generación; la fusión ya propuesta no se duplica (ni invertida).
select lives_ok($$ select public.guardar_red(public._prueba_red()) $$, 'regenerar');
select is((select count(*) from public.red_generada), 2::bigint, 'dos generaciones');
select is((select count(*) from public.fusion_propuesta), 1::bigint, 'el par se propone una sola vez');
select throws_ok(
  $$ insert into public.fusion_propuesta (organizacion_id, encargo_id, entidad_a, entidad_b, motivo)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
             'e0000000-0000-4000-8000-00000000000b', 'e0000000-0000-4000-8000-00000000000a', 'x') $$,
  '23505', null, 'el par invertido también cuenta como el mismo'
);

-- Ajuste manual con motivo (queda en bitácora por el disparador de la tarea 01).
select lives_ok(
  $$ update public.calificacion set ajuste_nivel = 'alto', ajuste_motivo = 'Visita de campo',
            ajustado_por = 'a0000000-0000-4000-8000-000000000002'
      where objeto_tipo = 'entidad' and red_id = (select id from public.red_generada order by generada_en desc limit 1) $$,
  'auditor ajusta el nivel con motivo'
);

-- Lector no resuelve fusiones.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok(
  $$ select public.resolver_fusion((select id from public.fusion_propuesta limit 1), true) $$,
  '42501', null, 'lector no resuelve fusiones'
);

-- Auditor acepta: B queda como alias de A; nada se reescribe.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select lives_ok(
  $$ select public.resolver_fusion((select id from public.fusion_propuesta limit 1), true) $$,
  'auditor acepta la fusión'
);
select is((select fusionada_en from public.entidad where id = 'e0000000-0000-4000-8000-00000000000b'),
          'e0000000-0000-4000-8000-00000000000a'::uuid, 'B apunta a A');
select is((select count(*) from public.alias_entidad where entidad_id = 'e0000000-0000-4000-8000-00000000000a'
            and alias = 'CARLOS MENDOZA RÍOS (PERSONAL)'), 1::bigint, 'A conserva el nombre de B como alias');
select is((select estado from public.fusion_propuesta limit 1), 'aceptada', 'la propuesta queda aceptada');
select is((select count(*) from public.bitacora where accion = 'fusion.aceptada'
            and actor = 'a0000000-0000-4000-8000-000000000002'), 1::bigint, 'la fusión queda en bitácora');
select throws_ok(
  $$ select public.resolver_fusion((select id from public.fusion_propuesta limit 1), false) $$,
  '22023', null, 'una fusión resuelta no se vuelve a resolver'
);

-- Reglas: solo admin crea versiones; la nueva queda activa y las anteriores no.
select throws_ok(
  $$ select public.nueva_version_reglas('b0000000-0000-4000-8000-000000000001',
       '[{"criterio":"fuerza_vinculo","peso":5,"parametros":{}}]'::jsonb) $$,
  '42501', null, 'auditor no versiona reglas'
);
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(
  public.nueva_version_reglas('b0000000-0000-4000-8000-000000000001',
    '[{"criterio":"fuerza_vinculo","peso":5,"parametros":{}},{"criterio":"riesgo_declarado","peso":60,"parametros":{}}]'::jsonb),
  2, 'admin crea la versión 2'
);
select is((select count(*) from public.regla_calificacion where activa), 2::bigint, 'solo la versión 2 queda activa');
select is((select max(version) from public.regla_calificacion where not activa), 1, 'la versión 1 se conserva inactiva');

reset role;
select * from finish();
rollback;
