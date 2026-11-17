-- Datos sintéticos para la prueba de carga (tarea 13). NO se aplica en producción: solo en el stack
-- local o de CI, antes de `playwright test e2e/carga.spec.ts`.
--   psql "$DB_URL" -v ON_ERROR_STOP=1 -f supabase/carga/sembrar.sql
-- Crea en la organización semilla el encargo «Carga sintética» con:
--   * 5,000 entidades, 7,500 vínculos y una red generada que los contiene (con calificaciones);
--   * el expediente EXP-CARGA con 50,000 registros validados, una extracción y dos menciones cada uno.
-- Idempotente: si el encargo ya existe, no hace nada.
\set org '''b0000000-0000-4000-8000-000000000001'''
\set enc '''c0000000-0000-4000-8000-0000000000ca'''
\set exp '''d0000000-0000-4000-8000-0000000000ca'''
\set red '''f0000000-0000-4000-8000-0000000000ca'''

begin;
select exists (select 1 from public.encargo where id = :enc) as ya \gset
\if :ya
  \echo 'La carga sintética ya existe.'
\else
insert into public.encargo (id, organizacion_id, nombre) values (:enc, :org, 'Carga sintética');
insert into public.expediente (id, organizacion_id, encargo_id, identificador, descripcion)
values (:exp, :org, :enc, 'EXP-CARGA', '50,000 registros sintéticos');

insert into public.entidad (id, organizacion_id, encargo_id, tipo, nombre, nombre_normalizado, identificadores, riesgo_declarado)
select ('e0000000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid, :org, :enc,
       case i % 4 when 0 then 'persona_moral' when 1 then 'persona_fisica' when 2 then 'cuenta' else 'telefono' end,
       'ENTIDAD SINTETICA ' || i, 'ENTIDAD SINTETICA ' || i, '{}'::jsonb,
       case when i % 50 = 0 then 'CRÍTICO' when i % 20 = 0 then 'ALTO' else null end
  from generate_series(1, 5000) i;

-- Una cadena más atajos: 7,500 vínculos.
insert into public.vinculo (id, organizacion_id, encargo_id, origen_id, destino_id, tipo, fuerza)
select gen_random_uuid(), :org, :enc,
       ('e0000000-0000-4000-8000-' || lpad(to_hex(a), 12, '0'))::uuid,
       ('e0000000-0000-4000-8000-' || lpad(to_hex(b), 12, '0'))::uuid,
       case (a + b) % 3 when 0 then 'socio' when 1 then 'transferencia' else 'familiar' end, 1 + (a % 10)
  from (select i as a, i + 1 as b from generate_series(1, 4999) i
        union all
        select i, 1 + ((i * 7919) % 5000) from generate_series(1, 2501) i where 1 + ((i * 7919) % 5000) <> i) v;

insert into public.red_generada (id, organizacion_id, encargo_id, semillas, alcance, version_reglas, resumen)
values (:red, :org, :enc, array[('e0000000-0000-4000-8000-' || lpad(to_hex(1), 12, '0'))::uuid], 2, 0,
        jsonb_build_object('entidades', 5000, 'vinculos', 7500, 'eventos', 0));
insert into public.red_nodo (organizacion_id, encargo_id, red_id, entidad_id, distancia)
select :org, :enc, :red, id, 1 from public.entidad where encargo_id = :enc;
insert into public.red_vinculo (organizacion_id, encargo_id, red_id, vinculo_id)
select :org, :enc, :red, id from public.vinculo where encargo_id = :enc;
insert into public.calificacion (organizacion_id, encargo_id, red_id, objeto_tipo, objeto_id, puntaje, nivel, criterios)
select :org, :enc, :red, 'entidad', id,
       case when riesgo_declarado = 'CRÍTICO' then 80 when riesgo_declarado = 'ALTO' then 55 else 10 end,
       case when riesgo_declarado = 'CRÍTICO' then 'critico' when riesgo_declarado = 'ALTO' then 'alto' else 'bajo' end,
       '[]'::jsonb
  from public.entidad where encargo_id = :enc;

-- 50,000 registros en el expediente.
insert into public.registro (id, organizacion_id, encargo_id, expediente_id, origen, fuente, fecha_documento,
                             estado_validacion, resumen)
select ('a0ca0000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid, :org, :enc, :exp, 'captura',
       'Carga sintética', date '2020-01-01' + (i % 1800), 'validado', 'Registro sintético ' || i
  from generate_series(1, 50000) i;
insert into public.extraccion (organizacion_id, encargo_id, registro_id, campo, valor_crudo, valor_normalizado,
                               metodo, estado, ubicacion)
select :org, :enc, ('a0ca0000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid, 'numero',
       'F-' || i, to_jsonb('F-' || i), 'manual', 'validado', '{}'::jsonb
  from generate_series(1, 50000) i;
insert into public.registro_entidad (organizacion_id, encargo_id, registro_id, entidad_id, rol)
select :org, :enc, ('a0ca0000-0000-4000-8000-' || lpad(to_hex(i), 12, '0'))::uuid,
       ('e0000000-0000-4000-8000-' || lpad(to_hex(1 + (i * k) % 5000), 12, '0'))::uuid,
       case k when 1 then 'proveedor' else 'dependencia' end
  from generate_series(1, 50000) i, (values (1), (13)) m(k);
\echo 'Carga sintética creada.'
\endif
commit;
analyze public.registro, public.registro_entidad, public.extraccion, public.entidad, public.vinculo,
        public.red_nodo, public.red_vinculo, public.calificacion;
