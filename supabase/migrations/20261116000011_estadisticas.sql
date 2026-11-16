-- Corrección: tras una importación grande el planificador no tiene estadísticas de las tablas
-- recién cargadas y las consultas con RLS pueden exceder el statement_timeout (8 s) hasta que
-- corre el autoanalyze. Esta función actualiza las estadísticas al terminar la carga.
--
-- Security definer porque ANALYZE exige ser dueño de la tabla. No lee ni devuelve datos: solo
-- recalcula estadísticas de una lista fija de tablas. Exige sesión iniciada.
create function public.actualizar_estadisticas()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'sesión requerida' using errcode = '42501';
  end if;
  analyze public.registro;
  analyze public.extraccion;
  analyze public.evidencia;
  analyze public.entidad;
  analyze public.alias_entidad;
  analyze public.registro_entidad;
  analyze public.vinculo;
  analyze public.evento;
  analyze public.evento_participante;
end;
$$;
revoke all on function public.actualizar_estadisticas() from public, anon;
grant execute on function public.actualizar_estadisticas() to authenticated;
