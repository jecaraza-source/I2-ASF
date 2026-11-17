import "server-only";
import { esCurp, esRfc } from "@sigma/importador";
import type { Json } from "@sigma/modelo";
import { z } from "zod";
import { ejecutarYGuardarReglas } from "@/lib/reglas-datos";
import { apiEjemplo } from "./api-ejemplo";
import { lista69b } from "./lista-69b";
import { otrosExpedientes } from "./otros-expedientes";
import type { ConectorFuente, EntidadConsulta, FuenteActiva, Servicio } from "./tipos";

/** Conectores conocidos. Una fuente con un conector que no está aquí no se consulta. */
export const CONECTORES: Record<string, ConectorFuente> = Object.fromEntries(
  [otrosExpedientes, lista69b, apiEjemplo].map((c) => [c.conector, c]),
);

/** Entidades por trabajo de lote: el resto continúa en un trabajo nuevo. */
const LOTE = 150;

const payloadSchema = z.object({
  encargo_id: z.uuid(),
  entidad_id: z.uuid().optional(),
  desde: z.number().int().min(0).optional(),
});

const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().toUpperCase() : null);

function aConsulta(e: {
  id: string;
  organizacion_id: string;
  encargo_id: string;
  tipo: string;
  nombre: string;
  nombre_normalizado: string;
  identificadores: unknown;
}): EntidadConsulta {
  const ids = (e.identificadores ?? {}) as Record<string, unknown>;
  const invalidos = Array.isArray(ids.invalidos) ? ids.invalidos : [];
  const rfc = texto(ids.rfc);
  const curp = texto(ids.curp);
  return {
    id: e.id,
    organizacion_id: e.organizacion_id,
    encargo_id: e.encargo_id,
    tipo: e.tipo,
    nombre: e.nombre,
    nombre_normalizado: e.nombre_normalizado,
    rfc: rfc && !invalidos.includes("rfc") && esRfc(rfc) ? rfc : null,
    curp: curp && !invalidos.includes("curp") && esCurp(curp) ? curp : null,
  };
}

/**
 * Trabajo `consulta_fuentes` (§11.1): consulta las fuentes activas de la organización para una
 * entidad (a demanda) o para todas las del encargo (por lote, en tramos). Guarda los resultados con
 * su huella y vuelve a ejecutar las reglas (R10). En los logs solo IDs y códigos.
 */
export async function consultarFuentes(
  servicio: Servicio,
  trabajo: { id: string; payload: unknown },
): Promise<void> {
  const p = payloadSchema.parse(trabajo.payload);
  const { data: encargo } = await servicio
    .from("encargo")
    .select("id, organizacion_id")
    .eq("id", p.encargo_id)
    .maybeSingle();
  if (!encargo) throw new Error("encargo inexistente");

  const { data: fuentesCrudas, error: errorFuentes } = await servicio
    .from("fuente_consulta")
    .select("id, nombre, tipo, conector, config")
    .eq("organizacion_id", encargo.organizacion_id)
    .eq("activa", true);
  if (errorFuentes) throw new Error(`fuentes ${errorFuentes.code ?? "?"}`);
  const fuentes: (FuenteActiva & { impl: ConectorFuente })[] = (fuentesCrudas ?? []).flatMap(
    (f) => {
      const impl = CONECTORES[f.conector];
      return impl ? [{ ...f, config: (f.config ?? {}) as Record<string, unknown>, impl }] : [];
    },
  );

  const columnas =
    "id, organizacion_id, encargo_id, tipo, nombre, nombre_normalizado, identificadores, fusionada_en";
  let entidades;
  if (p.entidad_id) {
    const { data } = await servicio
      .from("entidad")
      .select(columnas)
      .eq("id", p.entidad_id)
      .maybeSingle();
    if (!data) throw new Error("entidad inexistente");
    // Una entidad fusionada se consulta como la canónica.
    const canonica = data.fusionada_en
      ? (await servicio.from("entidad").select(columnas).eq("id", data.fusionada_en).maybeSingle())
          .data
      : data;
    entidades = canonica ? [canonica] : [];
  } else {
    const desde = p.desde ?? 0;
    const { data, error } = await servicio
      .from("entidad")
      .select(columnas)
      .eq("encargo_id", encargo.id)
      .is("fusionada_en", null)
      .order("id")
      .range(desde, desde + LOTE - 1);
    if (error) throw new Error(`entidades ${error.code ?? "?"}`);
    entidades = data ?? [];
    if (entidades.length === LOTE) {
      const { error: errorSiguiente } = await servicio.from("trabajo").insert({
        organizacion_id: encargo.organizacion_id,
        encargo_id: encargo.id,
        tipo: "consulta_fuentes",
        payload: { encargo_id: encargo.id, desde: desde + LOTE },
        creado_por: null,
      });
      if (errorSiguiente) throw new Error(`siguiente tramo ${errorSiguiente.code ?? "?"}`);
    }
  }

  let resultados = 0;
  for (const cruda of entidades) {
    const entidad = aConsulta(cruda);
    for (const fuente of fuentes) {
      if (!fuente.impl.aplica(entidad)) continue;
      // Un conector que envía datos fuera solo corre si la fuente lo permite para este encargo.
      if (fuente.impl.enviaDatos) {
        const permitidos = fuente.config.encargos_permitidos;
        if (!Array.isArray(permitidos) || !permitidos.includes(encargo.id)) continue;
      }
      const encontradas = await fuente.impl.buscar({ servicio, fuente }, entidad);
      if (!encontradas.length) continue;
      const { data, error } = await servicio.rpc("guardar_resultados_consulta", {
        p: {
          encargo_id: encargo.id,
          entidad_id: entidad.id,
          fuente_id: fuente.id,
          resultados: encontradas,
        } as unknown as Json,
      });
      if (error) throw new Error(`guardar_resultados ${error.code ?? "?"}`);
      resultados += typeof data === "number" ? data : 0;
    }
  }

  await servicio.from("bitacora").insert({
    organizacion_id: encargo.organizacion_id,
    encargo_id: encargo.id,
    actor: null,
    accion: "consulta.fuentes",
    objeto_tipo: p.entidad_id ? "entidad" : "encargo",
    objeto_id: p.entidad_id ?? encargo.id,
    detalle: {
      trabajo_id: trabajo.id,
      entidades: entidades.length,
      fuentes: fuentes.map((f) => f.id),
      resultados,
    },
  });
  // R10 depende de lo encontrado.
  const reglas = await ejecutarYGuardarReglas(servicio, encargo.id);
  if (!reglas.ok) console.error(`[consultarFuentes] reglas: ${reglas.codigo ?? "?"}`);
}
