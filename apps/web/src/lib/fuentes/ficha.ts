import "server-only";
import { z } from "zod";
import type { ResultadoVista } from "@/components/fuentes/resultados";
import { clienteServidor } from "@/lib/supabase/servidor";

type Cliente = Awaited<ReturnType<typeof clienteServidor>>;

const datosSchema = z
  .object({
    resumen: z.string().catch("Coincidencia"),
    situacion: z.string().optional().catch(undefined),
    por: z.string().optional().catch(undefined),
    encargo_id: z.string().optional().catch(undefined),
    entidad_id: z.string().optional().catch(undefined),
  })
  .catch({ resumen: "Coincidencia" });

/** Resultados de las fuentes para una entidad y el estado de su última consulta. */
export async function cargarConsultas(supabase: Cliente, encargoId: string, entidadId: string) {
  const [{ data: resultados }, { data: pendiente }, { data: ultima }] = await Promise.all([
    supabase
      .from("resultado_consulta")
      .select(
        "id, coincidencia, estado, datos, consultado_en, revisado_en, motivo, registro_id, fuente_consulta(nombre, tipo, conector)",
      )
      .eq("encargo_id", encargoId)
      .eq("entidad_id", entidadId)
      .order("coincidencia")
      .order("consultado_en", { ascending: false })
      .limit(200),
    supabase
      .from("trabajo")
      .select("id")
      .eq("encargo_id", encargoId)
      .eq("tipo", "consulta_fuentes")
      .in("estado", ["pendiente", "en_proceso"])
      .or(`payload->>entidad_id.eq.${entidadId},payload->>entidad_id.is.null`)
      .limit(1),
    supabase
      .from("bitacora")
      .select("en")
      .eq("encargo_id", encargoId)
      .eq("accion", "consulta.fuentes")
      .in("objeto_id", [entidadId, encargoId])
      .order("en", { ascending: false })
      .limit(1),
  ]);
  const vista = (resultados ?? []).map((r): ResultadoVista & { conector: string } => {
    const d = datosSchema.parse(r.datos);
    const enlace =
      r.fuente_consulta?.conector === "otros_expedientes" &&
      d.encargo_id &&
      d.entidad_id &&
      z.uuid().safeParse(d.encargo_id).success &&
      z.uuid().safeParse(d.entidad_id).success
        ? `/encargos/${d.encargo_id}/entidades/${d.entidad_id}`
        : null;
    return {
      id: r.id,
      conector: r.fuente_consulta?.conector ?? "",
      fuente: r.fuente_consulta?.nombre ?? "Fuente",
      externa: r.fuente_consulta?.tipo === "externa",
      coincidencia: r.coincidencia === "exacta" ? "exacta" : "propuesta",
      estado: r.estado === "confirmada" || r.estado === "descartada" ? r.estado : "pendiente",
      resumen: d.resumen,
      situacion: d.situacion ?? null,
      enlace,
      por: d.por ?? null,
      consultadoEn: r.consultado_en,
      revisadoEn: r.revisado_en,
      motivo: r.motivo,
      registroId: r.registro_id,
    };
  });
  return {
    otrosExpedientes: vista.filter((r) => r.conector === "otros_expedientes"),
    externas: vista.filter((r) => r.conector !== "otros_expedientes"),
    enCurso: Boolean(pendiente?.length),
    ultimaConsulta: ultima?.[0]?.en ?? null,
  };
}
