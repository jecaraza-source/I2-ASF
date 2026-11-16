-- Bitácora append-only, originales inmutables y disparadores de bitácora.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- Ejecuta una sentencia y devuelve las filas afectadas, o -1 si la base la rechaza.
-- Storage puede rechazar la operación con error o con 0 filas: ambas cuentan como falla.
create function public._prueba_filas_afectadas(p_sql text)
returns int
language plpgsql
security invoker
as $$
declare
  n int;
begin
  execute p_sql;
  get diagnostics n = row_count;
  return n;
exception when others then
  return -1;
end;
$$;
grant execute on function public._prueba_filas_afectadas(text) to authenticated;

-- ---------------------------------------------------------------------------
-- Disparadores: acciones sobre evidencia escriben en bitácora con su actor.
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);

insert into public.documento_origen (id, organizacion_id, encargo_id, sha256, storage_path, nombre_archivo)
values (
  '20000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001', repeat('a', 64),
  'b0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000001/' || repeat('a', 64),
  'contrato.pdf'
);
insert into public.registro (id, organizacion_id, encargo_id, origen, documento_id)
values ('30000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'documento', '20000000-0000-4000-8000-000000000001');
insert into public.extraccion (id, organizacion_id, encargo_id, registro_id, campo, valor_crudo, confianza, metodo)
values ('40000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
        'monto', '1,000.00', 0.5, 'ia');
update public.extraccion set estado = 'validado', validado_por = 'a0000000-0000-4000-8000-000000000002',
                             validado_en = now()
 where id = '40000000-0000-4000-8000-000000000001';
update public.registro set estado_validacion = 'validado' where id = '30000000-0000-4000-8000-000000000001';
insert into public.alerta (id, organizacion_id, encargo_id, regla, severidad)
values ('50000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'R01', 'alta');
update public.alerta set estado = 'descartada', resuelta_por = 'a0000000-0000-4000-8000-000000000002'
 where id = '50000000-0000-4000-8000-000000000001';
insert into public.red_generada (id, organizacion_id, encargo_id, semillas, alcance, version_reglas)
values ('60000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', array['70000000-0000-4000-8000-000000000001']::uuid[], 1, 1);
insert into public.calificacion (id, organizacion_id, encargo_id, red_id, objeto_tipo, objeto_id, puntaje, nivel)
values ('80000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', '60000000-0000-4000-8000-000000000001',
        'entidad', '70000000-0000-4000-8000-000000000001', 40, 'medio');
update public.calificacion set ajuste_nivel = 'alto', ajuste_motivo = 'Revisión de campo',
                               ajustado_por = 'a0000000-0000-4000-8000-000000000002'
 where id = '80000000-0000-4000-8000-000000000001';

select bag_eq(
  $$ select accion from public.bitacora where encargo_id = 'c0000000-0000-4000-8000-000000000001' $$,
  array['documento_origen.alta', 'registro.alta', 'extraccion.validacion', 'registro.cambio',
        'alerta.resolucion', 'calificacion.ajuste'],
  'cada acción sobre evidencia deja un renglón en bitácora'
);
select is(
  (select count(*) from public.bitacora
    where encargo_id = 'c0000000-0000-4000-8000-000000000001'
      and actor is distinct from 'a0000000-0000-4000-8000-000000000002'::uuid),
  0::bigint,
  'la bitácora registra al usuario que actuó'
);
select is(
  (select detalle -> 'estado' ->> 'despues' from public.bitacora where accion = 'extraccion.validacion'),
  'validado',
  'la bitácora guarda el cambio de estado'
);
select is(
  (select detalle ? 'valor_crudo' from public.bitacora where accion = 'extraccion.validacion'),
  false,
  'la bitácora no copia valores de la evidencia'
);
select throws_ok(
  $$ update public.calificacion set ajuste_nivel = 'critico', ajuste_motivo = null
      where id = '80000000-0000-4000-8000-000000000001' $$,
  '23514', null, 'un ajuste de nivel sin motivo se rechaza'
);

-- ---------------------------------------------------------------------------
-- bitacora: UPDATE y DELETE fallan para usuarios…
-- ---------------------------------------------------------------------------
select throws_ok(
  $$ update public.bitacora set accion = 'alterada' $$,
  '42501', null, 'UPDATE sobre bitácora falla para usuarios'
);
select throws_ok(
  $$ delete from public.bitacora $$,
  '42501', null, 'DELETE sobre bitácora falla para usuarios'
);

-- …y documento_origen no se edita ni se borra.
select throws_ok(
  $$ update public.documento_origen set nombre_archivo = 'otro.pdf' $$,
  '42501', null, 'UPDATE sobre documento_origen falla para usuarios'
);
select throws_ok(
  $$ delete from public.documento_origen $$,
  '42501', null, 'DELETE sobre documento_origen falla para usuarios'
);
select throws_ok(
  $$ delete from public.registro $$,
  '42501', null, 'DELETE sobre registro falla para usuarios'
);
select throws_ok(
  $$ delete from public.extraccion $$,
  '42501', null, 'DELETE sobre extraccion falla para usuarios'
);

-- ---------------------------------------------------------------------------
-- Bucket originales: el miembro sube y lee; nadie modifica ni borra.
-- ---------------------------------------------------------------------------
select lives_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('originales', 'b0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000001/'
             || repeat('a', 64)) $$,
  'auditor sube un original a su carpeta'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('originales', 'b0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-000000000001/no-es-hash') $$,
  '42501', null, 'una ruta que no es {organizacion}/{encargo}/{sha256} se rechaza'
);
select throws_ok(
  $$ insert into storage.objects (bucket_id, name)
     values ('originales', 'b0000000-0000-4000-8000-000000000001/c0000000-0000-4000-8000-0000000000ff/'
             || repeat('d', 64)) $$,
  '42501', null, 'una ruta con encargo inexistente se rechaza'
);
select isnt_empty(
  $$ select id from storage.objects where bucket_id = 'originales' $$,
  'auditor lee sus originales'
);
select ok(
  public._prueba_filas_afectadas($$ update storage.objects set name = name || '-x', metadata = '{"alterado":true}'
                                    where bucket_id = 'originales' $$) <= 0,
  'UPDATE sobre objetos del bucket no modifica ningún objeto'
);
select ok(
  public._prueba_filas_afectadas($$ delete from storage.objects where bucket_id = 'originales' $$) <= 0,
  'DELETE sobre objetos del bucket no borra ningún objeto'
);
select is(
  (select count(*) from storage.objects
    where bucket_id = 'originales' and name like '%/' || repeat('a', 64) and metadata is null),
  1::bigint,
  'el original sigue intacto'
);

-- ---------------------------------------------------------------------------
-- Ni siquiera el dueño de la base reescribe bitácora ni la identidad de un original.
-- ---------------------------------------------------------------------------
reset role;
select throws_ok(
  $$ update public.bitacora set accion = 'alterada' $$,
  '42501', null, 'UPDATE sobre bitácora falla también para el servidor'
);
select throws_ok(
  $$ delete from public.bitacora $$,
  '42501', null, 'DELETE sobre bitácora falla también para el servidor'
);
select throws_ok(
  $$ update public.documento_origen set sha256 = repeat('f', 64),
            storage_path = organizacion_id || '/' || encargo_id || '/' || repeat('f', 64) $$,
  '42501', null, 'el SHA-256 de un original no se reescribe'
);

select * from finish();
rollback;
