-- Datos de prueba para desarrollo local (supabase db reset). Nunca datos reales.
-- Usuarios (contraseña para los tres: sigma-local-123):
--   admin@sigma.test · auditor@sigma.test · lector@sigma.test

-- ---------------------------------------------------------------------------
-- Usuarios de Auth
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select
  '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
  extensions.crypt('sigma-local-123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('nombre', u.nombre),
  now(), now(), '', '', '', ''
from (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'admin@sigma.test', 'Admin de prueba'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'auditor@sigma.test', 'Auditor de prueba'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'lector@sigma.test', 'Lector de prueba')
) as u (id, email, nombre);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email like '%@sigma.test';

-- ---------------------------------------------------------------------------
-- Organización, miembros y encargo
-- ---------------------------------------------------------------------------
insert into public.organizacion (id, nombre)
values ('b0000000-0000-4000-8000-000000000001', 'Organización de prueba');

insert into public.miembro (organizacion_id, usuario_id, rol) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000001', 'admin'),
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'auditor'),
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000003', 'lector');

insert into public.encargo (id, organizacion_id, nombre, tipo_auditoria, periodo_inicio, periodo_fin, creado_por)
values (
  'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
  'Encargo de prueba', 'forense', '2024-01-01', '2024-12-31',
  'a0000000-0000-4000-8000-000000000001'
);

-- ---------------------------------------------------------------------------
-- Catálogo provisional de categorías y tipos de documento (§6)
-- ---------------------------------------------------------------------------
insert into public.categoria_documental (organizacion_id, nombre, orden)
select 'b0000000-0000-4000-8000-000000000001', c.nombre, c.orden
from (values
  ('Contractual', 1), ('Financiera', 2), ('Fiscal', 3),
  ('Corporativa', 4), ('Comunicaciones', 5), ('Otros', 6)
) as c (nombre, orden);

insert into public.tipo_documento (organizacion_id, clave, nombre, categoria_id)
select 'b0000000-0000-4000-8000-000000000001', t.clave, t.nombre, c.id
from (values
  ('contrato', 'Contrato', 'Contractual'),
  ('convenio_modificatorio', 'Convenio modificatorio', 'Contractual'),
  ('acta_entrega', 'Acta de entrega', 'Contractual'),
  ('estado_cuenta', 'Estado de cuenta', 'Financiera'),
  ('comprobante_transferencia', 'Comprobante de transferencia', 'Financiera'),
  ('cfdi', 'CFDI', 'Fiscal'),
  ('constancia_situacion_fiscal', 'Constancia de situación fiscal', 'Fiscal'),
  ('acta_constitutiva', 'Acta constitutiva', 'Corporativa'),
  ('poder_notarial', 'Poder notarial', 'Corporativa'),
  ('registro_telefonico', 'Registro telefónico', 'Comunicaciones'),
  ('oficio', 'Oficio', 'Comunicaciones'),
  ('otro', 'Otro', 'Otros')
) as t (clave, nombre, categoria)
join public.categoria_documental c
  on c.organizacion_id = 'b0000000-0000-4000-8000-000000000001' and c.nombre = t.categoria;
