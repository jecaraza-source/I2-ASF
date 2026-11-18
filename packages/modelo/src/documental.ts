/**
 * Expediente documental (§6.1): lectura de los filtros desde la URL, carga para las funciones de la
 * base y enlaces que conservan el estado. Funciones puras.
 */
import { z } from "zod";

export const VISTAS_DOCUMENTAL = ["expediente", "entidad", "categoria", "tiempo"] as const;
export type VistaDocumental = (typeof VISTAS_DOCUMENTAL)[number];
export const NOMBRE_VISTA: Record<VistaDocumental, string> = {
  expediente: "Por expediente",
  entidad: "Por entidad",
  categoria: "Por categoría",
  tiempo: "Línea de tiempo",
};

export const ORDENES_DOCUMENTAL = ["fecha", "resumen", "tipo", "estado", "calificacion"] as const;
export type OrdenDocumental = (typeof ORDENES_DOCUMENTAL)[number];

export const ESTADOS_DOCUMENTAL = ["validados", "pendiente", "rechazado"] as const;
export const ORIGENES_DOCUMENTAL = ["documento", "captura", "importacion", "campo"] as const;
export const NOMBRE_ORIGEN: Record<(typeof ORIGENES_DOCUMENTAL)[number], string> = {
  documento: "Documento",
  captura: "Captura manual",
  importacion: "Excel",
  campo: "Verificación en campo",
};

export const POR_PAGINA_DOCUMENTAL = 50;

const uuidOSin = z.union([z.uuid(), z.literal("sin")]);
const fecha = z.iso.date();
const opcional = <T extends z.ZodType>(s: T) => s.optional().catch(undefined);
const primero = (v: unknown) => (Array.isArray(v) ? v[0] : v);
const vacioANulo = (v: unknown) => {
  const x = primero(v);
  return typeof x === "string" && x.trim() === "" ? undefined : x;
};

const filtrosSchema = z.object({
  vista: z.enum(VISTAS_DOCUMENTAL).catch("expediente"),
  expediente: opcional(uuidOSin),
  entidad: opcional(uuidOSin),
  categoria: opcional(uuidOSin),
  estado: opcional(z.enum(ESTADOS_DOCUMENTAL)),
  origen: opcional(z.enum(ORIGENES_DOCUMENTAL)),
  desde: opcional(fecha),
  hasta: opcional(fecha),
  q: opcional(z.string().trim().max(120)),
  orden: z.enum(ORDENES_DOCUMENTAL).optional().catch(undefined),
  dir: z.enum(["asc", "desc"]).optional().catch(undefined),
  pagina: z.coerce.number().int().min(1).max(100_000).catch(1),
});
export type FiltrosDocumental = z.infer<typeof filtrosSchema>;

/** Lee los filtros de la URL. Lo que no es válido se ignora (nunca rompe la página). */
export function leerFiltrosDocumental(
  entrada: Record<string, string | string[] | undefined>,
): FiltrosDocumental {
  const limpia = Object.fromEntries(Object.entries(entrada).map(([k, v]) => [k, vacioANulo(v)]));
  return filtrosSchema.parse(limpia);
}

/** Orden por defecto de cada vista: la línea de tiempo va de lo más antiguo a lo más reciente. */
export function ordenEfectivo(f: FiltrosDocumental): {
  orden: OrdenDocumental;
  dir: "asc" | "desc";
} {
  if (f.vista === "tiempo") return { orden: "fecha", dir: "asc" };
  if (f.vista === "categoria") return { orden: "tipo", dir: f.dir ?? "asc" };
  return { orden: f.orden ?? "fecha", dir: f.dir ?? "desc" };
}

/**
 * Carga para `expediente_registros` y `expediente_arbol`. En la vista por entidad se ignora el
 * expediente: la entidad se sigue a través de todos los expedientes del encargo.
 */
export function cargaDocumental(
  encargoId: string,
  f: FiltrosDocumental,
  pagina?: { limite: number; desplazamiento: number },
): Record<string, string | number> {
  const { orden, dir } = ordenEfectivo(f);
  const carga: Record<string, string | number | undefined> = {
    encargo_id: encargoId,
    expediente_id: f.vista === "entidad" ? undefined : f.expediente,
    entidad_id: f.entidad,
    categoria_id: f.categoria,
    estado: f.estado,
    origen: f.origen,
    desde: f.desde,
    hasta: f.hasta,
    q: f.q,
    orden,
    dir,
    limite: pagina?.limite,
    desplazamiento: pagina?.desplazamiento,
  };
  return Object.fromEntries(
    Object.entries(carga).filter((e): e is [string, string | number] => e[1] !== undefined),
  );
}

/** Carga sin los filtros del árbol: el árbol muestra todos sus nodos con los demás filtros. */
export function cargaArbol(encargoId: string, f: FiltrosDocumental): Record<string, string> {
  const carga = cargaDocumental(encargoId, {
    ...f,
    expediente: undefined,
    entidad: undefined,
    categoria: undefined,
  });
  return Object.fromEntries(
    Object.entries(carga)
      .filter(([k]) => k !== "orden" && k !== "dir")
      .map(([k, v]) => [k, String(v)]),
  );
}

type Cambios = Partial<Record<keyof FiltrosDocumental, string | number | undefined>>;

/** Enlace con los filtros actuales más los cambios; un cambio que no es de página vuelve a la 1. */
export function hrefDocumental(ruta: string, f: FiltrosDocumental, cambios: Cambios = {}): string {
  const valores: Record<string, string | number | undefined> = {
    vista: f.vista === "expediente" ? undefined : f.vista,
    expediente: f.expediente,
    entidad: f.entidad,
    categoria: f.categoria,
    estado: f.estado,
    origen: f.origen,
    desde: f.desde,
    hasta: f.hasta,
    q: f.q,
    orden: f.orden,
    dir: f.dir,
    // Cambiar cualquier filtro regresa a la primera página; solo se conserva si no cambia nada.
    pagina: Object.keys(cambios).length === 0 && f.pagina > 1 ? f.pagina : undefined,
    ...cambios,
  };
  if (valores.vista === "expediente") valores.vista = undefined;
  if (valores.pagina === 1) valores.pagina = undefined;
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(valores)) {
    if (v !== undefined && v !== "") p.set(k, String(v));
  }
  const qs = p.toString();
  return qs ? `${ruta}?${qs}` : ruta;
}
