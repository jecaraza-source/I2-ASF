import "server-only";
import type { Coincidencia, ConectorFuente } from "./tipos";

const LIMITE = 50;

/**
 * La entidad en los demás encargos de la misma organización. Por RFC o CURP: exacta; por tipo y
 * nombre normalizado: propuesta. Nunca cruza organizaciones: filtra por la organización de la
 * entidad, además de RLS.
 */
export const otrosExpedientes: ConectorFuente = {
  conector: "otros_expedientes",
  enviaDatos: false,
  aplica: () => true,
  async buscar({ servicio }, e) {
    const base = () =>
      servicio
        .from("entidad")
        .select("id, encargo_id, nombre, tipo, encargo!inner(nombre)")
        .eq("organizacion_id", e.organizacion_id)
        .neq("encargo_id", e.encargo_id)
        .is("fusionada_en", null)
        .limit(LIMITE);
    const [porRfc, porCurp, porNombre] = await Promise.all([
      e.rfc
        ? base().eq("identificadores->>rfc", e.rfc)
        : Promise.resolve({ data: [], error: null }),
      e.curp
        ? base().eq("identificadores->>curp", e.curp)
        : Promise.resolve({ data: [], error: null }),
      base().eq("tipo", e.tipo).eq("nombre_normalizado", e.nombre_normalizado),
    ]);
    const error = porRfc.error ?? porCurp.error ?? porNombre.error;
    if (error) throw new Error(`otros_expedientes ${error.code ?? "?"}`);

    const encontradas = new Map<string, Coincidencia>();
    const agregar = (
      filas:
        | {
            id: string;
            encargo_id: string;
            nombre: string;
            tipo: string;
            encargo: { nombre: string } | null;
          }[]
        | null,
      por: "rfc" | "curp" | "nombre",
    ) => {
      for (const x of filas ?? []) {
        if (encontradas.has(x.id)) continue;
        encontradas.set(x.id, {
          huella: `exp:${x.id}`,
          coincidencia: por === "nombre" ? "propuesta" : "exacta",
          datos: {
            resumen: `${x.nombre} en «${x.encargo?.nombre ?? "otro encargo"}»`,
            por,
            encargo_id: x.encargo_id,
            encargo: x.encargo?.nombre ?? null,
            entidad_id: x.id,
            nombre: x.nombre,
          },
        });
      }
    };
    agregar(porRfc.data, "rfc");
    agregar(porCurp.data, "curp");
    agregar(porNombre.data, "nombre");
    return [...encontradas.values()];
  },
};
