-- Tarea 21 · Migración 27: la constancia de situación fiscal no lleva contrato, factura, cuenta ni
-- monto. docs/ESPECIFICACION.md §6. Sin cambios de tablas ni de RLS.

create or replace function privado.ajustes_comunes(p_clave text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case p_clave
    when 'acta_constitutiva' then '[
      {"clave":"numero_contrato","oculto":true},
      {"clave":"numero_factura","oculto":true},
      {"clave":"numero_cuenta","oculto":true},
      {"clave":"telefono","oculto":true},
      {"clave":"monto","etiqueta":"Capital social constitutivo"},
      {"clave":"domicilio","etiqueta":"Domicilio social"}]'::jsonb
    when 'poder_notarial' then '[
      {"clave":"numero_contrato","oculto":true},
      {"clave":"numero_factura","oculto":true},
      {"clave":"numero_cuenta","oculto":true},
      {"clave":"monto","oculto":true},
      {"clave":"telefono","oculto":true}]'::jsonb
    when 'constancia_situacion_fiscal' then '[
      {"clave":"numero_contrato","oculto":true},
      {"clave":"numero_factura","oculto":true},
      {"clave":"numero_cuenta","oculto":true},
      {"clave":"monto","oculto":true},
      {"clave":"domicilio","etiqueta":"Domicilio fiscal"}]'::jsonb
    else '[]'::jsonb
  end;
$$;
revoke all on function privado.ajustes_comunes(text) from public, anon, authenticated;

-- Constancias ya existentes: igual que en la migración 24, solo si el tipo aún no ajusta ningún
-- campo común (no se pisa lo que una organización ya configuró).
update public.tipo_documento t
   set campos_esperados = t.campos_esperados || privado.ajustes_comunes(t.clave)
 where t.clave = 'constancia_situacion_fiscal'
   and not exists (
     select 1 from jsonb_array_elements(t.campos_esperados) c
      where c ->> 'clave' in ('fecha_documento', 'numero_expediente', 'numero_contrato',
                              'numero_factura', 'numero_cuenta', 'monto', 'domicilio', 'telefono'));
