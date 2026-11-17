-- Alta de tipos de documento por el administrador (el disparador de campos provisionales no debe
-- exigirle permisos sobre el esquema privado).
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

set local role authenticated;

-- Admin: da de alta un tipo sin campos provisionales y otro que sí los tiene.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select lives_ok($$
  insert into public.tipo_documento (organizacion_id, categoria_id, clave, nombre)
  select 'b0000000-0000-4000-8000-000000000001', id, 'identificacion_prueba', 'Identificación oficial'
    from public.categoria_documental
   where organizacion_id = 'b0000000-0000-4000-8000-000000000001' limit 1
$$, 'admin da de alta un tipo de documento nuevo');
select is((select campos_esperados from public.tipo_documento where clave = 'identificacion_prueba'),
          '[]'::jsonb, 'un tipo fuera del catálogo provisional nace sin campos');

-- Auditor: sigue sin poder escribir el catálogo.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$
  insert into public.tipo_documento (organizacion_id, categoria_id, clave, nombre)
  select 'b0000000-0000-4000-8000-000000000001', id, 'otro_prueba', 'Otro'
    from public.categoria_documental
   where organizacion_id = 'b0000000-0000-4000-8000-000000000001' limit 1
$$, '42501', null, 'auditor no da de alta tipos');

-- La función de campos provisionales sigue cerrada para los usuarios.
select throws_ok($$ select privado.campos_provisionales('contrato') $$, '42501', null,
                 'los usuarios no llaman directo a la función privada');

reset role;
select * from finish();
rollback;
