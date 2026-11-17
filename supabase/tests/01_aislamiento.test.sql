-- Un usuario de la organización A no lee ni escribe nada de la organización B.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- ---------------------------------------------------------------------------
-- Preparación (como postgres): organización B con su usuario y datos en cada
-- tabla relevante. La organización A es la del seed.
-- ---------------------------------------------------------------------------
insert into auth.users (id, email, aud, role)
values ('a0000000-0000-4000-8000-0000000000b1', 'auditor-b@sigma.test', 'authenticated', 'authenticated');

insert into public.organizacion (id, nombre) values ('b0000000-0000-4000-8000-0000000000b0', 'Organización B');
insert into public.miembro (organizacion_id, usuario_id, rol)
values ('b0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-0000000000b1', 'auditor');
insert into public.encargo (id, organizacion_id, nombre)
values ('c0000000-0000-4000-8000-0000000000b0', 'b0000000-0000-4000-8000-0000000000b0', 'Encargo B');
insert into public.expediente (id, organizacion_id, encargo_id)
values ('d0000000-0000-4000-8000-0000000000b0', 'b0000000-0000-4000-8000-0000000000b0', 'c0000000-0000-4000-8000-0000000000b0');
insert into public.categoria_documental (id, organizacion_id, nombre)
values ('e0000000-0000-4000-8000-0000000000b0', 'b0000000-0000-4000-8000-0000000000b0', 'Contractual');
insert into public.tipo_documento (organizacion_id, clave, nombre, categoria_id)
values ('b0000000-0000-4000-8000-0000000000b0', 'contrato', 'Contrato', 'e0000000-0000-4000-8000-0000000000b0');
insert into public.registro (id, organizacion_id, encargo_id, expediente_id, origen, fuente)
values ('f0000000-0000-4000-8000-0000000000b0', 'b0000000-0000-4000-8000-0000000000b0',
        'c0000000-0000-4000-8000-0000000000b0', 'd0000000-0000-4000-8000-0000000000b0', 'captura', 'Oficio B');
insert into public.extraccion (organizacion_id, encargo_id, registro_id, campo, valor_crudo, metodo)
values ('b0000000-0000-4000-8000-0000000000b0', 'c0000000-0000-4000-8000-0000000000b0',
        'f0000000-0000-4000-8000-0000000000b0', 'monto', '100.00', 'manual');
insert into public.entidad (id, organizacion_id, encargo_id, tipo, nombre, nombre_normalizado, identificadores)
values ('10000000-0000-4000-8000-0000000000b0', 'b0000000-0000-4000-8000-0000000000b0',
        'c0000000-0000-4000-8000-0000000000b0', 'persona_moral', 'Empresa B', 'EMPRESA B', '{"rfc":"EBB010101AAA"}');
insert into public.alerta (organizacion_id, encargo_id, regla, severidad)
values ('b0000000-0000-4000-8000-0000000000b0', 'c0000000-0000-4000-8000-0000000000b0', 'R01', 'alta');
insert into public.trabajo (organizacion_id, encargo_id, tipo)
values ('b0000000-0000-4000-8000-0000000000b0', 'c0000000-0000-4000-8000-0000000000b0', 'extraccion');
-- Las fuentes de B (otros expedientes y lista 69-B) las crea el disparador de organización.
insert into public.fuente_consulta (organizacion_id, nombre, tipo, conector)
values ('b0000000-0000-4000-8000-0000000000b0', 'Fuente propia de B', 'externa', 'api_ejemplo');

-- Objeto en el bucket subido por el auditor de B (pasa por RLS de storage).
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);
insert into storage.objects (bucket_id, name)
values ('originales', 'b0000000-0000-4000-8000-0000000000b0/c0000000-0000-4000-8000-0000000000b0/'
        || repeat('b', 64));
reset role;

-- La bitácora de B ya tiene renglones (alta de registro).
select ok(
  (select count(*) from public.bitacora where organizacion_id = 'b0000000-0000-4000-8000-0000000000b0') > 0,
  'preparación: la bitácora de B tiene renglones'
);

-- Cuenta filas de una organización en cada tabla de dominio, con los
-- permisos de quien la invoca.
create function public._prueba_filas_por_tabla(p_organizacion uuid)
returns table (tabla text, filas bigint)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  t text;
begin
  for t in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'organizacion_id'
    order by c.table_name
  loop
    tabla := t;
    execute format('select count(*) from public.%I where organizacion_id = $1', t)
      into filas using p_organizacion;
    return next;
  end loop;
end;
$$;
grant execute on function public._prueba_filas_por_tabla(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Como auditor de A
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

select is(filas, 0::bigint, 'A no lee filas de B en ' || tabla)
from public._prueba_filas_por_tabla('b0000000-0000-4000-8000-0000000000b0');

select ok(
  (select count(*) from public._prueba_filas_por_tabla('b0000000-0000-4000-8000-0000000000b0')) >= 29,
  'la revisión cubre todas las tablas con organizacion_id'
);

select is_empty(
  $$ select id from public.organizacion where id = 'b0000000-0000-4000-8000-0000000000b0' $$,
  'A no ve la organización B'
);

select is_empty(
  $$ select id from storage.objects where name like 'b0000000-0000-4000-8000-0000000000b0/%' $$,
  'A no ve los originales de B'
);

-- Escrituras directas en B: RLS las rechaza.
select throws_ok(
  $$ insert into public.encargo (organizacion_id, nombre)
     values ('b0000000-0000-4000-8000-0000000000b0', 'intruso') $$,
  '42501', null, 'A no crea encargos en B'
);
select throws_ok(
  $$ insert into public.registro (organizacion_id, encargo_id, origen, fuente)
     values ('b0000000-0000-4000-8000-0000000000b0', 'c0000000-0000-4000-8000-0000000000b0', 'captura', 'x') $$,
  '42501', null, 'A no crea registros en B'
);
select throws_ok(
  $$ insert into public.bitacora (organizacion_id, actor, accion, objeto_tipo)
     values ('b0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-000000000002', 'x', 'x') $$,
  '42501', null, 'A no escribe en la bitácora de B'
);
select throws_ok(
  $$ insert into public.miembro (organizacion_id, usuario_id, rol)
     values ('b0000000-0000-4000-8000-0000000000b0', 'a0000000-0000-4000-8000-000000000002', 'admin') $$,
  '42501', null, 'A no se agrega como miembro de B'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('originales', 'b0000000-0000-4000-8000-0000000000b0/c0000000-0000-4000-8000-0000000000b0/'
             || repeat('c', 64)) $$,
  '42501', null, 'A no sube originales a la carpeta de B'
);

-- Mezclar organización propia con encargo ajeno: lo impide la clave compuesta.
select throws_ok(
  $$ insert into public.registro (organizacion_id, encargo_id, origen, fuente)
     values ('b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-0000000000b0', 'captura', 'x') $$,
  '23503', null, 'A no liga un registro suyo a un encargo de B'
);

-- Actualizar filas de B no afecta nada.
select is_empty(
  $$ update public.registro set resumen = 'alterado'
     where id = 'f0000000-0000-4000-8000-0000000000b0' returning id $$,
  'A no actualiza registros de B'
);
select is_empty(
  $$ update public.entidad set nombre = 'alterado'
     where id = '10000000-0000-4000-8000-0000000000b0' returning id $$,
  'A no actualiza entidades de B'
);

-- ---------------------------------------------------------------------------
-- Como auditor de B, en sentido inverso
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000b1","role":"authenticated"}', true);

select is(filas, 0::bigint, 'B no lee filas de A en ' || tabla)
from public._prueba_filas_por_tabla('b0000000-0000-4000-8000-000000000001');

select isnt_empty(
  $$ select id from public.registro where id = 'f0000000-0000-4000-8000-0000000000b0' $$,
  'B sí ve sus propios registros'
);

reset role;

-- Los datos de B siguen intactos.
select is(
  (select resumen from public.registro where id = 'f0000000-0000-4000-8000-0000000000b0'),
  null,
  'el registro de B no cambió'
);

select * from finish();
rollback;
