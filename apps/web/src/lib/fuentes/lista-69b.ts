import "server-only";
import { NOMBRE_SITUACION_69B, SITUACIONES_69B } from "@sigma/importador/lista69b";
import type { Coincidencia, ConectorFuente } from "./tipos";

const nombreSituacion = (s: string) =>
  (SITUACIONES_69B as readonly string[]).includes(s)
    ? NOMBRE_SITUACION_69B[s as (typeof SITUACIONES_69B)[number]]
    : s;

/**
 * Lista 69-B del SAT sobre la carga vigente (copia local: ningún dato sale de la plataforma).
 * Por RFC: exacta. Por nombre normalizado: propuesta.
 */
export const lista69b: ConectorFuente = {
  conector: "lista_69b",
  enviaDatos: false,
  aplica: (e) => e.tipo === "persona_moral" || e.tipo === "persona_fisica",
  async buscar({ servicio, fuente }, e) {
    const { data: carga, error: errorCarga } = await servicio
      .from("carga_fuente")
      .select("id, sha256, vigente_desde")
      .eq("fuente_id", fuente.id)
      .eq("estado", "vigente")
      .maybeSingle();
    if (errorCarga) throw new Error(`lista_69b ${errorCarga.code ?? "?"}`);
    if (!carga) return [];
    const base = () =>
      servicio
        .from("lista_69b")
        .select("rfc, nombre, situacion, datos")
        .eq("carga_id", carga.id)
        .limit(20);
    const [porRfc, porNombre] = await Promise.all([
      e.rfc ? base().eq("rfc", e.rfc) : Promise.resolve({ data: [], error: null }),
      base().eq("nombre_normalizado", e.nombre_normalizado),
    ]);
    const error = porRfc.error ?? porNombre.error;
    if (error) throw new Error(`lista_69b ${error.code ?? "?"}`);

    const encontradas = new Map<string, Coincidencia>();
    for (const [filas, coincidencia] of [
      [porRfc.data, "exacta"],
      [porNombre.data, "propuesta"],
    ] as const) {
      for (const x of filas ?? []) {
        if (encontradas.has(x.rfc)) continue;
        encontradas.set(x.rfc, {
          huella: `69b:${x.rfc}`,
          coincidencia,
          datos: {
            resumen: `${x.nombre} · RFC ${x.rfc} · ${nombreSituacion(x.situacion)}`,
            rfc: x.rfc,
            nombre: x.nombre,
            situacion: x.situacion,
            publicaciones: x.datos,
            carga_id: carga.id,
            carga_sha256: carga.sha256,
            carga_vigente_desde: carga.vigente_desde,
          },
        });
      }
    }
    return [...encontradas.values()];
  },
};
