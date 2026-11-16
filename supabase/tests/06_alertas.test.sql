-- Alertas: guardar ejecuciones de reglas sin duplicar y resolver con motivo.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into public.registro (id, organizacion_id, encargo_id, origen, fuente, estado_validacion, resumen) values
  ('3a000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'captura', 'Prueba', 'validado', 'Portada'),
  ('3a000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'captura', 'Prueba', 'validado', 'Resumen');

create function public._prueba_alertas(p_huellas text[]) returns jsonb language sql as $$
  select jsonb_build_object(
    'encargo_id', 'c0000000-0000-4000-8000-000000000001',
    'reglas', jsonb_build_array('R02', 'R06'),
    'alertas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'regla', left(h, 3), 'severidad', 'alta', 'huella', h,
        'detalle', jsonb_build_object('titulo', 'Cifras distintas', 'entidades', '[]'::jsonb),
        'evidencias', jsonb_build_array(
          jsonb_build_object('registro_id', '3a000000-0000-4000-8000-000000000001', 'extraccion_id', null),
          jsonb_build_object('registro_id', '3a000000-0000-4000-8000-000000000002', 'extraccion_id', null))))
      from unnest(p_huellas) h), '[]'::jsonb));
$$;
grant execute on function public._prueba_alertas(text[]) to authenticated;

set local role authenticated;

-- Lector no ejecuta reglas.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$ select public.guardar_alertas(public._prueba_alertas(array['R02|a'])) $$, '42501', null,
                 'lector no guarda alertas');

-- Auditor ejecuta: dos alertas nuevas con sus evidencias.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is(public.guardar_alertas(public._prueba_alertas(array['R02|a', 'R06|b'])) ->> 'nuevas', '2', 'dos alertas nuevas');
select is((select count(*) from public.alerta where huella is not null), 2::bigint, 'alertas guardadas');
select is((select count(*) from public.evidencia where objeto_tipo = 'alerta'), 4::bigint, 'dos evidencias por alerta');
select is((select count(*) from public.bitacora where accion = 'reglas.ejecutadas'), 1::bigint, 'la ejecución queda en bitácora');

-- Reejecutar no duplica alertas ni evidencias.
select is(public.guardar_alertas(public._prueba_alertas(array['R02|a', 'R06|b'])) ->> 'nuevas', '0', 'reejecutar no crea alertas');
select is((select count(*) from public.alerta where huella is not null), 2::bigint, 'sin duplicados');
select is((select count(*) from public.evidencia where objeto_tipo = 'alerta'), 4::bigint, 'evidencias sin duplicar');

-- Resolver exige motivo y solo una vez.
select throws_ok(
  $$ select public.resolver_alerta((select id from public.alerta where huella = 'R02|a'), 'descartada', ' ') $$,
  '22023', null, 'descartar sin motivo falla');
select throws_ok(
  $$ update public.alerta set estado = 'confirmada' where huella = 'R02|a' $$,
  '23514', null, 'tampoco por actualización directa');
select lives_ok(
  $$ select public.resolver_alerta((select id from public.alerta where huella = 'R02|a'), 'descartada', 'Error de captura en la portada') $$,
  'auditor descarta con motivo');
select is((select resolucion_motivo from public.alerta where huella = 'R02|a'), 'Error de captura en la portada', 'motivo guardado');
select is((select resuelta_por from public.alerta where huella = 'R02|a'), 'a0000000-0000-4000-8000-000000000002'::uuid, 'quién resolvió');
select is((select count(*) from public.bitacora where accion = 'alerta.resolucion'), 1::bigint, 'la resolución queda en bitácora');
select throws_ok(
  $$ select public.resolver_alerta((select id from public.alerta where huella = 'R02|a'), 'confirmada', 'Otra vez') $$,
  '22023', null, 'una alerta resuelta no se vuelve a resolver');

-- Una ejecución que ya no reproduce R06|b la deja no vigente; la descartada no se reabre.
select is(public.guardar_alertas(public._prueba_alertas(array['R02|a'])) ->> 'no_vigentes', '1', 'una alerta deja de reproducirse');
select is((select vigente from public.alerta where huella = 'R06|b'), false, 'queda marcada como no vigente');
select is((select estado from public.alerta where huella = 'R06|b'), 'abierta', 'sin cambiar su estado');
select is((select estado from public.alerta where huella = 'R02|a'), 'descartada', 'la descartada sigue descartada');
select is(public.guardar_alertas(public._prueba_alertas(array['R02|a', 'R06|b'])) ->> 'nuevas', '0', 'si reaparece no se duplica');
select is((select vigente from public.alerta where huella = 'R06|b'), true, 'y vuelve a estar vigente');

-- Lector ve pero no resuelve.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select is((select count(*) from public.alerta where huella is not null), 2::bigint, 'lector ve las alertas');
select throws_ok(
  $$ select public.resolver_alerta((select id from public.alerta where huella = 'R06|b'), 'confirmada', 'Intento') $$,
  '42501', null, 'lector no resuelve');

reset role;
select * from finish();
rollback;
