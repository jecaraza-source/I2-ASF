-- Volver a leer con IA: la lectura anterior queda reemplazada (no se borra) y deja de contar.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

insert into storage.objects (bucket_id, name) values
  ('originales', 'b0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000001/' || repeat('8', 64));

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select public.registrar_documento(jsonb_build_object(
  'encargo_id', 'c0000000-0000-4000-8000-000000000001', 'sha256', repeat('8', 64),
  'nombre_archivo', 'releer.pdf', 'mime', 'application/pdf', 'tamano', 10,
  'tipo_documento_id', (select id from public.tipo_documento
                         where organizacion_id = 'b0000000-0000-4000-8000-000000000001' and clave = 'contrato'),
  'fuente', 'Prueba', 'expediente_nuevo', 'EXP-RELEER'));
reset role;

create temporary table t_reg on commit drop as
  select id from public.registro where resumen = 'releer.pdf';
grant select on t_reg to authenticated, service_role;

create function pg_temp.lectura(p_numero text) returns jsonb language sql as $$
  select jsonb_build_object(
    'registro_id', (select id from t_reg),
    'proveedor', 'anthropic', 'modelo', 'm',
    'extracciones', jsonb_build_array(
      jsonb_build_object('campo', 'numero_contrato', 'valor_crudo', p_numero, 'valor_normalizado', p_numero,
                         'confianza', 0.95, 'ubicacion', jsonb_build_object('pagina', 1), 'estado', 'validado'),
      jsonb_build_object('campo', 'objeto', 'valor_crudo', 'Obra', 'valor_normalizado', 'Obra',
                         'confianza', 0.3, 'ubicacion', '{}'::jsonb, 'estado', 'pendiente')));
$$;
create function pg_temp.reg() returns uuid language sql as $$ select id from t_reg $$;
grant execute on function pg_temp.reg() to authenticated;

set local role service_role;
select public.guardar_extraccion_ia(pg_temp.lectura('C-VIEJO'));
reset role;

set local role authenticated;

-- Lector: no puede.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select throws_ok($$ select public.releer_extraccion(pg_temp.reg()) $$, 'P0002', null,
                 'lector no vuelve a leer');

-- Auditor.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select isnt(public.releer_extraccion(pg_temp.reg()), null, 'auditor vuelve a leer un documento sin validar');
select is((select estado_extraccion from public.registro where id = pg_temp.reg()), 'en_cola',
          'el documento regresa a la cola');
select results_eq($$ select campo, estado from public.extraccion where registro_id = pg_temp.reg() order by campo $$,
                  $$ values ('numero_contrato', 'reemplazado'), ('objeto', 'reemplazado') $$,
                  'las lecturas anteriores se conservan como reemplazadas, también la que pasó el umbral');
select is((select count(*) from public.trabajo where tipo = 'extraccion' and estado = 'pendiente'
            and payload ->> 'registro_id' = pg_temp.reg()::text), 2::bigint,
          'hay un trabajo de lectura nuevo (además del que dejó el ingreso)');
select is((select detalle ->> 'reemplazadas' from public.bitacora
            where accion = 'extraccion.releer' and objeto_id = pg_temp.reg()), '2',
          'queda en bitácora con su autor');
select throws_ok($$ select public.releer_extraccion(pg_temp.reg()) $$, '22023', null,
                 'mientras está en cola no se pide otra lectura');
reset role;

-- El procesador guarda la lectura nueva.
set local role service_role;
select is(public.guardar_extraccion_ia(pg_temp.lectura('C-NUEVO')) ->> 'extracciones', '2', 'llega la lectura nueva');
reset role;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

-- Una decisión sobre una lectura reemplazada no se acepta.
select throws_ok($$ select public.validar_registro(jsonb_build_object(
  'registro_id', pg_temp.reg(), 'fecha_documento', '2022-03-15', 'resumen', 'Contrato',
  'decisiones', (select jsonb_agg(jsonb_build_object('extraccion_id', id, 'estado', 'validado'))
                   from public.extraccion where registro_id = pg_temp.reg())))
$$, '22023', null, 'solo se deciden las lecturas vigentes');

select lives_ok($$ select public.validar_registro(jsonb_build_object(
  'registro_id', pg_temp.reg(), 'fecha_documento', '2022-03-15', 'resumen', 'Contrato',
  'decisiones', (select jsonb_agg(jsonb_build_object('extraccion_id', id, 'estado', 'validado'))
                   from public.extraccion where registro_id = pg_temp.reg() and estado <> 'reemplazado')))
$$, 'se valida con las lecturas nuevas');
select results_eq($$ select valor_crudo, estado from public.extraccion
                      where registro_id = pg_temp.reg() and campo = 'numero_contrato' order by estado $$,
                  $$ values ('C-VIEJO', 'reemplazado'), ('C-NUEVO', 'validado') $$,
                  'la lectura vieja sigue reemplazada y la nueva queda validada');
select throws_ok($$ select public.releer_extraccion(pg_temp.reg()) $$, '22023', null,
                 'un documento ya validado no se vuelve a leer');

select * from finish();
rollback;
