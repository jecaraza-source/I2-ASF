/**
 * Parámetros de las tablas con orden, filtro y paginación en servidor.
 * Vienen de la URL (no confiables): se validan y se acotan a columnas permitidas.
 */
import { z } from "zod";

export const POR_PAGINA_OPCIONES = [10, 25, 50, 100] as const;

export type ParametrosTabla<C extends string> = {
  pagina: number;
  porPagina: number;
  orden: C;
  dir: "asc" | "desc";
  q: string;
};

type Entrada = Record<string, string | string[] | undefined>;

const primero = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export function leerParametrosTabla<C extends string>(
  entrada: Entrada,
  config: { columnas: readonly C[]; ordenPorDefecto: C; dirPorDefecto?: "asc" | "desc" },
): ParametrosTabla<C> {
  const pagina = z.coerce
    .number()
    .int()
    .min(1)
    .max(100_000)
    .catch(1)
    .parse(primero(entrada.pagina));
  const porPagina = z.coerce
    .number()
    .int()
    .refine((n) => (POR_PAGINA_OPCIONES as readonly number[]).includes(n))
    .catch(25)
    .parse(primero(entrada.por));
  const ordenCrudo = primero(entrada.orden);
  const orden = config.columnas.find((c) => c === ordenCrudo) ?? config.ordenPorDefecto;
  const dirCruda = primero(entrada.dir);
  const dir =
    dirCruda === "asc" || dirCruda === "desc" ? dirCruda : (config.dirPorDefecto ?? "asc");
  const q = limpiarBusqueda(primero(entrada.q) ?? "");
  return { pagina, porPagina, orden, dir, q };
}

/**
 * Deja la búsqueda segura para filtros de PostgREST (`or`, `ilike`): quita los
 * caracteres que alteran la sintaxis del filtro o actúan como comodín.
 */
export function limpiarBusqueda(q: string): string {
  return q
    .replace(/[,()*%\\"':.]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 100);
}

/** Rango inclusivo [desde, hasta] para `.range()` de supabase-js. */
export function rangoDePagina(p: { pagina: number; porPagina: number }): [number, number] {
  const desde = (p.pagina - 1) * p.porPagina;
  return [desde, desde + p.porPagina - 1];
}

export function totalPaginas(total: number, porPagina: number): number {
  return Math.max(1, Math.ceil(total / porPagina));
}
