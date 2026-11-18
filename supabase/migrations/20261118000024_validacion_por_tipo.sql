-- Tarea 18 · Migración 24: campos comunes ajustados por tipo de documento.
-- docs/ESPECIFICACION.md §6.
--
-- Una entrada de `campos_esperados` con la clave de un campo común (fecha_documento,
-- numero_expediente, numero_contrato, numero_factura, numero_cuenta, monto, domicilio, telefono)
-- ya no es un campo propio: lo renombra (`etiqueta`) o lo quita (`oculto: true`) en ese tipo. La
-- aplicación (`camposComunesDe`) es la que lo interpreta; aquí solo se siembran los ajustes del
-- catálogo provisional. Sin cambios de tablas ni de RLS.

-- ---------------------------------------------------------------------------
-- Ajustes de los campos comunes en el catálogo provisional.
-- ---------------------------------------------------------------------------
create function privado.ajustes_comunes(p_clave text)
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
    else '[]'::jsonb
  end;
$$;
revoke all on function privado.ajustes_comunes(text) from public, anon, authenticated;

-- Tipos ya existentes: se agregan los ajustes solo si el tipo aún no ajusta ningún campo común
-- (no se pisa lo que una organización ya configuró).
update public.tipo_documento t
   set campos_esperados = t.campos_esperados || privado.ajustes_comunes(t.clave)
 where privado.ajustes_comunes(t.clave) <> '[]'::jsonb
   and not exists (
     select 1 from jsonb_array_elements(t.campos_esperados) c
      where c ->> 'clave' in ('fecha_documento', 'numero_expediente', 'numero_contrato',
                              'numero_factura', 'numero_cuenta', 'monto', 'domicilio', 'telefono'));

-- Los tipos nuevos del catálogo provisional nacen con sus campos y sus ajustes. Definer (en
-- `privado`) para que el alta de un tipo por un administrador pueda leer el catálogo provisional.
create or replace function privado.tipo_documento_campos()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.campos_esperados = '[]'::jsonb then
    new.campos_esperados := privado.campos_provisionales(new.clave) || privado.ajustes_comunes(new.clave);
  end if;
  return new;
end;
$$;
revoke all on function privado.tipo_documento_campos() from public, anon, authenticated;
