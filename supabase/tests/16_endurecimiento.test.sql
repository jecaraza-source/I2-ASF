-- Endurecimiento: sin SECURITY DEFINER expuestas, evidencia que no se edita y escrituras solo por funciones.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- Asesor 0028/0029: ninguna función SECURITY DEFINER en el esquema expuesto.
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.prosecdef), 0::bigint,
          'no quedan funciones SECURITY DEFINER en public');
select ok((select bool_and(not p.prosecdef) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = 'public' and p.proname in ('es_miembro', 'registrar_acceso_fallido',
              'usuarios_organizacion', 'bitacora_registro', 'actualizar_estadisticas')),
          'las envolturas en public son SECURITY INVOKER');

-- anon solo ejecuta el registro de accesos fallidos.
select is(
  (select array_agg(p.proname::text order by p.proname) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'privado') and p.prokind = 'f'
      and has_function_privilege('anon', p.oid, 'execute')),
  array['registrar_acceso_fallido', 'registrar_acceso_fallido'],
  'anon solo puede ejecutar registrar_acceso_fallido (envoltura y cuerpo)');
select ok(not has_function_privilege('authenticated', 'privado.campos_provisionales(text)', 'execute'),
          'las funciones privadas cerradas siguen cerradas');

-- Las envolturas funcionan igual.
set local role anon;
select lives_ok($$ select public.registrar_acceso_fallido('nadie@ninguno.test', '1.2.3.4', 'prueba') $$,
                'anon registra un acceso fallido');
reset role;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;
select ok(public.es_miembro('b0000000-0000-4000-8000-000000000001', '{auditor}'), 'es_miembro responde por la envoltura');
select ok(not public.es_miembro('b0000000-0000-4000-8000-000000000001', '{admin}'), 'y distingue el rol');
select throws_ok($$ select * from public.usuarios_organizacion('b0000000-0000-4000-8000-000000000001') $$,
                 '42501', null, 'la envoltura conserva la verificación de rol');

-- Datos de prueba.
reset role;
insert into public.entidad (id, organizacion_id, encargo_id, tipo, nombre, nombre_normalizado)
values ('e1300000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'persona_moral', 'Uno SA', 'UNO SA'),
       ('e1300000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'persona_moral', 'Dos SA', 'DOS SA');
insert into public.vinculo (id, organizacion_id, encargo_id, origen_id, destino_id, tipo, fuerza)
values ('e1300000-0000-4000-8000-0000000000a1', 'b0000000-0000-4000-8000-000000000001',
        'c0000000-0000-4000-8000-000000000001', 'e1300000-0000-4000-8000-000000000001',
        'e1300000-0000-4000-8000-000000000002', 'socio', 5);
set local role authenticated;

-- Evidencia que no se modifica.
select throws_ok($$ update public.vinculo set fuerza = 10 where id = 'e1300000-0000-4000-8000-0000000000a1' $$,
                 '42501', null, 'un auditor no modifica un vínculo');
select throws_ok($$ update public.evento set monto = 1 $$, '42501', null, 'ni un evento');
select throws_ok($$ update public.registro_entidad set rol = 'x' $$, '42501', null, 'ni una mención');
select throws_ok($$ update public.alias_entidad set alias = 'x' $$, '42501', null, 'ni un alias');

-- Entidad: por la API directa no; dentro de una función sí.
select set_config('request.path', '/entidad', true);
select throws_ok($$ update public.entidad set nombre = 'Otro' where id = 'e1300000-0000-4000-8000-000000000001' $$,
                 '42501', null, 'PATCH directo a entidad se rechaza');
select has_trigger('public', 'extraccion', 'extraccion_solo_por_funcion', 'extracción con el mismo candado');
select has_trigger('public', 'fusion_propuesta', 'fusion_propuesta_solo_por_funcion', 'propuesta de fusión con el mismo candado');
select set_config('request.path', '/rpc/resolver_fusion', true);
select lives_ok($$ update public.entidad set nombre = 'Uno SA de CV' where id = 'e1300000-0000-4000-8000-000000000001' $$,
                'dentro de una función de la plataforma sí se modifica');
select set_config('request.path', '', true);

-- Índices del asesor de rendimiento.
reset role;
select has_index('public', 'lista_69b', 'lista_69b_organizacion_carga_idx', 'índice de la llave foránea de lista_69b');
select has_index('public', 'organizacion', 'organizacion_creado_por_idx', 'índice de organizacion.creado_por');
select ok(not has_table_privilege('authenticated', 'public.organizacion', 'delete'), 'sin permiso de borrar organizaciones');

select * from finish();
rollback;
