-- Vínculos derivados de un documento validado: cada involucrado se une con la sociedad según su
-- papel, el socio con su aportación y su participación; con evidencia y sin duplicarse.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

create function public._prueba_acta() returns jsonb language sql as $$
  select jsonb_build_object(
    'encargo_id', 'c0000000-0000-4000-8000-000000000001',
    'tipo_documento_id', (select id from public.tipo_documento
                           where organizacion_id = 'b0000000-0000-4000-8000-000000000001' and clave = 'acta_constitutiva'),
    'expediente_id', null, 'fuente', 'Registro Público', 'fecha_documento', '2020-01-10',
    'resumen', 'Acta constitutiva ACTA-T20 (captura manual)',
    'campos', jsonb_build_array(
      jsonb_build_object('campo', 'monto', 'valor_crudo', '100,000', 'valor_normalizado',
                         jsonb_build_object('monto', '100000.00', 'moneda', 'MXN')),
      jsonb_build_object('campo', 'involucrado_1', 'valor_crudo', 'SOCIEDAD T20',
                         'valor_normalizado', jsonb_build_object('nombre', 'SOCIEDAD T20', 'rol', 'titular', 'tipo', 'persona_moral')),
      jsonb_build_object('campo', 'involucrado_2', 'valor_crudo', 'ANA T20 · aportación 25,000',
                         'valor_normalizado', jsonb_build_object('nombre', 'ANA T20', 'rol', 'socio', 'tipo', 'persona_fisica',
                           'aportacion', jsonb_build_object('monto', '25000.00', 'moneda', 'MXN'))),
      jsonb_build_object('campo', 'involucrado_3', 'valor_crudo', 'LUIS T20',
                         'valor_normalizado', jsonb_build_object('nombre', 'LUIS T20', 'rol', 'comisario', 'tipo', 'persona_fisica')),
      jsonb_build_object('campo', 'involucrado_4', 'valor_crudo', 'NOTARIO T20',
                         'valor_normalizado', jsonb_build_object('nombre', 'NOTARIO T20', 'rol', 'notario', 'tipo', 'persona_fisica'))),
    'involucrados', jsonb_build_array(
      jsonb_build_object('tipo', 'persona_moral', 'nombre', 'Sociedad T20', 'nombre_normalizado', 'SOCIEDAD T20',
                         'rol', 'titular', 'identificadores', '{}'::jsonb),
      jsonb_build_object('tipo', 'persona_fisica', 'nombre', 'Ana T20', 'nombre_normalizado', 'ANA T20',
                         'rol', 'socio', 'identificadores', '{}'::jsonb),
      jsonb_build_object('tipo', 'persona_fisica', 'nombre', 'Luis T20', 'nombre_normalizado', 'LUIS T20',
                         'rol', 'comisario', 'identificadores', '{}'::jsonb),
      jsonb_build_object('tipo', 'persona_fisica', 'nombre', 'Notario T20', 'nombre_normalizado', 'NOTARIO T20',
                         'rol', 'notario', 'identificadores', '{}'::jsonb)),
    'evento', null);
$$;
grant execute on function public._prueba_acta() to authenticated;

select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$ select public.capturar_registro(public._prueba_acta()) $$, 'auditor captura un acta');
-- El disparador es diferido (al confirmar la transacción); aquí se adelanta.
set constraints all immediate;
reset role;

create temp view v20 as
  select v.tipo, o.nombre_normalizado as origen, d.nombre_normalizado as destino, v.monto, v.moneda,
         v.participacion, v.fuerza, v.dirigido, v.registro_id, v.id
    from public.vinculo v
    join public.entidad o on o.id = v.origen_id
    join public.entidad d on d.id = v.destino_id
    join public.registro r on r.id = v.registro_id
   where r.resumen = 'Acta constitutiva ACTA-T20 (captura manual)';

select is((select string_agg(tipo || ':' || origen || '>' || destino, ',' order by tipo) from v20),
  'comisario:LUIS T20>SOCIEDAD T20,notario:NOTARIO T20>SOCIEDAD T20,socio:ANA T20>SOCIEDAD T20',
  'cada involucrado queda unido a la sociedad con su papel');
select is((select monto::text || ' ' || moneda || ' ' || participacion::text || ' ' || fuerza from v20 where tipo = 'socio'),
  '25000.00 MXN 0.25000 3', 'el socio lleva su aportación, su participación y la fuerza que le corresponde');
select is((select count(*)::int from v20 where tipo <> 'socio' and monto is not null), 0, 'los demás papeles sin monto');
select is((select count(*)::int from public.evidencia e join v20 on v20.id = e.objeto_id
            where e.objeto_tipo = 'vinculo' and e.registro_id = v20.registro_id and e.extraccion_id is not null),
  3, 'cada vínculo apunta a su registro y a la lectura del involucrado');

-- Volver a derivar no duplica.
select is(privado.vinculos_de_documento('c0000000-0000-4000-8000-000000000001',
  (select registro_id from v20 limit 1)), 0, 'volver a derivar no crea nada');
select is((select count(*)::int from v20), 3, 'siguen siendo tres');

-- Sin sociedad clara (dos empresas sin titular) no se adivina.
select is(privado.vinculos_de_documento('c0000000-0000-4000-8000-000000000001', gen_random_uuid()), 0,
  'un registro inexistente no deriva nada');

select * from finish();
rollback;
