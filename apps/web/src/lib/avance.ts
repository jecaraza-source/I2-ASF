import "server-only";
import type { SenalAvance } from "@sigma/modelo";
import { clienteServidor } from "@/lib/supabase/servidor";

type Cliente = Awaited<ReturnType<typeof clienteServidor>>;

/**
 * Avance del encargo para los recorridos guiados: cuántos objetos hay de cada cosa. Solo conteos,
 * nunca contenido. RLS decide qué ve cada quien.
 */
export async function avanceEncargo(
  supabase: Cliente,
  encargoId: string,
): Promise<Record<SenalAvance, number>> {
  const contar = { count: "exact", head: true } as const;
  const registros = () =>
    supabase.from("registro").select("id", contar).eq("encargo_id", encargoId);
  const alertas = () =>
    supabase.from("alerta").select("id", contar).eq("encargo_id", encargoId).eq("vigente", true);
  const [
    expedientes,
    importaciones,
    documentos,
    extracciones,
    validados,
    llamadas,
    entidades,
    red,
    todas,
    resueltas,
  ] = await Promise.all([
    supabase.from("expediente").select("id", contar).eq("encargo_id", encargoId),
    registros().eq("origen", "importacion"),
    registros().eq("origen", "documento"),
    registros().eq("estado_extraccion", "hecha"),
    registros().eq("origen", "documento").in("estado_validacion", ["validado", "corregido"]),
    supabase.from("evento").select("id", contar).eq("encargo_id", encargoId).eq("tipo", "llamada"),
    supabase.from("entidad").select("id", contar).eq("encargo_id", encargoId),
    supabase.from("red_generada").select("id", contar).eq("encargo_id", encargoId),
    alertas(),
    alertas().neq("estado", "abierta"),
  ]);
  return {
    expedientes: expedientes.count ?? 0,
    importaciones: importaciones.count ?? 0,
    documentos: documentos.count ?? 0,
    extracciones: extracciones.count ?? 0,
    validados: validados.count ?? 0,
    llamadas: llamadas.count ?? 0,
    entidades: entidades.count ?? 0,
    red: red.count ?? 0,
    alertas: todas.count ?? 0,
    alertas_resueltas: resueltas.count ?? 0,
  };
}
