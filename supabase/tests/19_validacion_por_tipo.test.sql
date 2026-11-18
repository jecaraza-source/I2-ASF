-- Campos comunes ajustados por tipo: el acta constitutiva renombra el monto y el domicilio y quita
-- contrato, factura, cuenta y teléfono; un tipo nuevo del catálogo nace con sus ajustes.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

select ok(
  (select campos_esperados @> '[{"clave":"monto","etiqueta":"Capital social constitutivo"},{"clave":"domicilio","etiqueta":"Domicilio social"},{"clave":"numero_contrato","oculto":true}]'
     from public.tipo_documento
    where organizacion_id = 'b0000000-0000-4000-8000-000000000001' and clave = 'acta_constitutiva'),
  'el acta constitutiva del catálogo trae sus ajustes');
select ok(
  (select campos_esperados @> '[{"clave":"objeto_social","tipo":"texto_largo"}]'
     from public.tipo_documento
    where organizacion_id = 'b0000000-0000-4000-8000-000000000001' and clave = 'acta_constitutiva'),
  'conserva sus campos propios');
select ok(
  (select campos_esperados @> '[{"clave":"monto","oculto":true}]'
     from public.tipo_documento
    where organizacion_id = 'b0000000-0000-4000-8000-000000000001' and clave = 'poder_notarial'),
  'el poder notarial no lleva monto');
select is(
  (select count(*)::int from public.tipo_documento t, jsonb_array_elements(t.campos_esperados) c
    where t.organizacion_id = 'b0000000-0000-4000-8000-000000000001' and t.clave = 'acta_constitutiva'
      and c ->> 'clave' = 'monto'),
  1, 'el ajuste no se duplica');

-- Un administrador da de alta otra organización con su catálogo: el tipo nace ajustado.
insert into public.organizacion (id, nombre) values ('b0000000-0000-4000-8000-0000000000e9', 'Org prueba 19');
insert into public.miembro (organizacion_id, usuario_id, rol)
values ('b0000000-0000-4000-8000-0000000000e9', 'a0000000-0000-4000-8000-000000000001', 'admin');
insert into public.categoria_documental (id, organizacion_id, nombre)
values ('c1900000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-0000000000e9', 'Corporativo');
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
set local role authenticated;
select lives_ok($$
  insert into public.tipo_documento (organizacion_id, clave, nombre, categoria_id)
  values ('b0000000-0000-4000-8000-0000000000e9', 'acta_constitutiva', 'Acta constitutiva', 'c1900000-0000-4000-8000-000000000001')
$$, 'el administrador da de alta el tipo');
select ok(
  (select campos_esperados @> '[{"clave":"monto","etiqueta":"Capital social constitutivo"},{"clave":"objeto_social"}]'
     from public.tipo_documento
    where organizacion_id = 'b0000000-0000-4000-8000-0000000000e9' and clave = 'acta_constitutiva'),
  'nace con campos propios y ajustes');
reset role;

select * from finish();
rollback;
