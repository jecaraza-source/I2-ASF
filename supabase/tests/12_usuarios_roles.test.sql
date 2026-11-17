-- Usuarios y roles: baja lógica, candados, control de cambios y bitácora de acceso.
begin;
create extension if not exists pgtap with schema extensions;
select * from no_plan();

-- Un usuario más para las pruebas (sin membresía todavía).
insert into auth.users (id, email) values ('a0000000-0000-4000-8000-0000000000aa', 'nuevo@sigma.test');

set local role authenticated;

-- Auditor: no administra usuarios.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select throws_ok($$ select * from public.usuarios_organizacion('b0000000-0000-4000-8000-000000000001') $$,
                 '42501', null, 'auditor no consulta los usuarios');
select throws_ok($$ select * from public.bitacora_usuarios('b0000000-0000-4000-8000-000000000001', 'acceso') $$,
                 '42501', null, 'auditor no consulta la bitácora de usuarios');
select throws_ok($$ select public.usuario_por_correo('b0000000-0000-4000-8000-000000000001', 'nuevo@sigma.test') $$,
                 '42501', null, 'auditor no busca usuarios por correo');
select throws_ok($$
  insert into public.miembro (organizacion_id, usuario_id, rol)
  values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000aa', 'lector')
$$, '42501', null, 'auditor no da de alta usuarios');
select is_empty($$
  update public.miembro set rol = 'admin'
   where usuario_id = 'a0000000-0000-4000-8000-000000000002' returning id
$$, 'auditor no se sube el rol');

-- Admin: alta, cambio de rol, baja y reactivación.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000001","role":"authenticated"}', true);
select is(public.usuario_por_correo('b0000000-0000-4000-8000-000000000001', 'NUEVO@sigma.test'),
          'a0000000-0000-4000-8000-0000000000aa'::uuid, 'admin encuentra al usuario por correo');
select lives_ok($$
  insert into public.miembro (organizacion_id, usuario_id, rol, activo)
  values ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-0000000000aa', 'lector', false)
$$, 'admin da de alta un usuario');
select ok((select activo from public.miembro where usuario_id = 'a0000000-0000-4000-8000-0000000000aa'),
          'un miembro nace activo aunque el insert diga otra cosa');
select is((select count(*)::int from public.usuarios_organizacion('b0000000-0000-4000-8000-000000000001')),
          4, 'admin ve a los cuatro usuarios');

update public.miembro set rol = 'auditor' where usuario_id = 'a0000000-0000-4000-8000-0000000000aa';
update public.miembro set activo = false where usuario_id = 'a0000000-0000-4000-8000-0000000000aa';
select ok((select desactivado_en is not null
                  and desactivado_por = 'a0000000-0000-4000-8000-000000000001'
             from public.miembro where usuario_id = 'a0000000-0000-4000-8000-0000000000aa'),
          'la baja guarda cuándo y quién');
update public.miembro set activo = true where usuario_id = 'a0000000-0000-4000-8000-0000000000aa';
select ok((select desactivado_en is null from public.miembro
            where usuario_id = 'a0000000-0000-4000-8000-0000000000aa'), 'la reactivación limpia la baja');

select results_eq($$
  select accion, detalle ->> 'antes', detalle ->> 'despues'
    from public.bitacora_usuarios('b0000000-0000-4000-8000-000000000001', 'cambios',
                                  'a0000000-0000-4000-8000-0000000000aa')
   order by en, accion
$$, $$ values ('usuario.alta', null, null), ('usuario.baja', null, null),
              ('usuario.reactivacion', null, null), ('usuario.rol', 'lector', 'auditor') $$,
  'el control de cambios guarda alta, rol (antes y después), baja y reactivación');
select is((select actor_correo from public.bitacora_usuarios('b0000000-0000-4000-8000-000000000001', 'cambios',
                                                              'a0000000-0000-4000-8000-0000000000aa') limit 1),
          'admin@sigma.test', 'el control de cambios dice quién lo hizo');

-- Candados.
select throws_ok($$ update public.miembro set rol = 'lector' where usuario_id = 'a0000000-0000-4000-8000-000000000001' $$,
                 '23514', null, 'nadie cambia su propio rol');
select throws_ok($$ update public.miembro set activo = false where usuario_id = 'a0000000-0000-4000-8000-000000000001' $$,
                 '23514', null, 'nadie se da de baja a sí mismo');
select throws_ok($$ update public.miembro set usuario_id = 'a0000000-0000-4000-8000-000000000003'
                     where usuario_id = 'a0000000-0000-4000-8000-0000000000aa' $$,
                 '23514', null, 'no se cambia el usuario de un miembro');
select throws_ok($$ delete from public.miembro where usuario_id = 'a0000000-0000-4000-8000-0000000000aa' $$,
                 '42501', null, 'los miembros no se borran');

-- Último administrador: otro admin no puede dejar a la organización sin administradores.
update public.miembro set rol = 'admin' where usuario_id = 'a0000000-0000-4000-8000-0000000000aa';
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);
select lives_ok($$ update public.miembro set rol = 'auditor' where usuario_id = 'a0000000-0000-4000-8000-000000000001' $$,
                'con dos administradores se puede degradar a uno');
reset role;
select throws_ok($$ update public.miembro set activo = false where usuario_id = 'a0000000-0000-4000-8000-0000000000aa' $$,
                 '23514', null, 'no se da de baja al último administrador (ni desde el servidor)');
set local role authenticated;

-- Baja: el usuario desactivado ya no pasa ninguna política.
update public.miembro set activo = false where usuario_id = 'a0000000-0000-4000-8000-000000000002';
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
select is((select count(*)::int from public.encargo), 0, 'un usuario dado de baja no ve encargos');
select is((select count(*)::int from public.miembro), 0, 'ni a los miembros');

-- Bitácora de acceso.
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
select lives_ok($$ select public.registrar_acceso('inicio', '203.0.113.7', 'Navegador de prueba') $$,
                'un usuario registra su inicio de sesión');
select throws_ok($$ select public.registrar_acceso('otro') $$, '22023', null, 'tipo de acceso validado');
reset role;
set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select lives_ok($$ select public.registrar_acceso_fallido('lector@sigma.test', '203.0.113.9', 'x') $$,
                'un intento fallido se registra sin sesión');
select lives_ok($$ select public.registrar_acceso_fallido('nadie@sigma.test', '203.0.113.9', 'x') $$,
                'un correo desconocido no falla ni revela nada');
select throws_ok($$ select public.registrar_acceso('inicio') $$, '42501', null, 'sin sesión no hay registro de inicio');
do $$ begin for i in 1..15 loop perform public.registrar_acceso_fallido('lector@sigma.test'); end loop; end $$;
reset role;
select is((select count(*)::int from public.bitacora where accion = 'sesion.fallo'
            and objeto_id = 'a0000000-0000-4000-8000-000000000003'), 10,
          'a lo más 10 intentos fallidos por usuario y hora');

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-4000-8000-0000000000aa","role":"authenticated"}', true);
select results_eq($$
  select accion, usuario_correo, detalle ->> 'ip'
    from public.bitacora_usuarios('b0000000-0000-4000-8000-000000000001', 'acceso')
   where accion = 'sesion.inicio'
$$, $$ values ('sesion.inicio', 'lector@sigma.test', '203.0.113.7') $$,
  'la bitácora de acceso muestra quién entró y desde dónde');

reset role;
select * from finish();
rollback;
