-- Permisos por rol dentro de la misma organización (§3).
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

set local role authenticated;

-- ---------------------------------------------------------------------------
-- lector: solo lectura
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);

select isnt_empty($$ select id from public.encargo $$, 'lector lee encargos');
select isnt_empty($$ select id from public.tipo_documento $$, 'lector lee el catálogo');

select throws_ok(
  $$ insert into public.encargo (organizacion_id, nombre)
     values ('b0000000-0000-4000-8000-000000000001', 'x') $$,
  '42501', null, 'lector no crea encargos'
);
select throws_ok(
  $$ insert into public.expediente (organizacion_id, encargo_id)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'lector no crea expedientes'
);
select throws_ok(
  $$ insert into public.registro (organizacion_id, encargo_id, origen, fuente)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'captura', 'x') $$,
  '42501', null, 'lector no crea registros'
);
select throws_ok(
  $$ insert into public.entidad (organizacion_id, encargo_id, tipo, nombre, nombre_normalizado)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001',
             'persona_moral', 'X', 'X') $$,
  '42501', null, 'lector no crea entidades'
);
select throws_ok(
  $$ insert into public.alerta (organizacion_id, encargo_id, regla, severidad)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'R01', 'alta') $$,
  '42501', null, 'lector no crea alertas'
);
select throws_ok(
  $$ insert into public.trabajo (organizacion_id, tipo)
     values ('b0000000-0000-4000-8000-000000000001', 'extraccion') $$,
  '42501', null, 'lector no encola trabajos'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('originales', 'b0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000001/'
             || repeat('a', 64)) $$,
  '42501', null, 'lector no sube originales'
);
select is_empty(
  $$ update public.encargo set nombre = 'alterado' returning id $$,
  'lector no actualiza encargos'
);

-- ---------------------------------------------------------------------------
-- auditor: opera el encargo, pero no configura el catálogo
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.expediente (organizacion_id, encargo_id, descripcion)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'prueba') $$,
  'auditor crea expedientes'
);
select matches(
  (select identificador from public.expediente where descripcion = 'prueba'),
  '^EXP-[0-9]{4}-[0-9]{4}$',
  'el expediente sin identificador recibe EXP-AAAA-NNNN'
);
select lives_ok(
  $$ insert into public.registro (organizacion_id, encargo_id, origen, fuente)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'captura', 'Oficio 1') $$,
  'auditor crea registros'
);
select throws_ok(
  $$ insert into public.registro (organizacion_id, encargo_id, origen)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'captura') $$,
  '23514', null, 'una captura sin fuente declarada se rechaza'
);
select throws_ok(
  $$ insert into public.categoria_documental (organizacion_id, nombre)
     values ('b0000000-0000-4000-8000-000000000001', 'Nueva') $$,
  '42501', null, 'auditor no edita el catálogo de categorías'
);
select throws_ok(
  $$ insert into public.regla_calificacion (organizacion_id, version, criterio, peso)
     values ('b0000000-0000-4000-8000-000000000001', 1, 'riesgo_declarado', 60) $$,
  '42501', null, 'auditor no edita reglas de calificación'
);

-- ---------------------------------------------------------------------------
-- admin: configura
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);

select lives_ok(
  $$ insert into public.categoria_documental (organizacion_id, nombre, orden)
     values ('b0000000-0000-4000-8000-000000000001', 'Nueva', 7) $$,
  'admin edita el catálogo'
);
select lives_ok(
  $$ insert into public.regla_calificacion (organizacion_id, version, criterio, peso)
     values ('b0000000-0000-4000-8000-000000000001', 99, 'riesgo_declarado', 60) $$,
  'admin crea reglas de calificación'
);

-- ---------------------------------------------------------------------------
-- anónimo: nada
-- ---------------------------------------------------------------------------
reset role;
set local role anon;
select throws_ok(
  $$ select count(*) from public.encargo $$,
  '42501', null, 'anon no tiene acceso a las tablas de dominio'
);

reset role;
select * from finish();
rollback;
