-- Corrige el alta de tipos de documento desde la aplicación.
--
-- El disparador `tipo_documento_campos` (migración 13) corría con los permisos de quien inserta y
-- llamaba a `privado.campos_provisionales`, que los usuarios no pueden ejecutar: todo INSERT en
-- `tipo_documento` hecho por un administrador fallaba con 42501 («Tu rol no permite esta acción»).
--
-- El disparador pasa a `security definer`. No amplía permisos: RLS sigue decidiendo quién inserta, y
-- la función solo lee la clave de la fila nueva para rellenar `campos_esperados` cuando viene vacío.
alter function privado.tipo_documento_campos() security definer;
revoke all on function privado.tipo_documento_campos() from public, anon, authenticated;
