/**
 * Matriz de permisos por rol (docs/ESPECIFICACION.md §3).
 * La UI la usa para mostrar u ocultar acciones y el servidor para rechazar
 * mutaciones antes de llegar a la base. La última palabra la tiene RLS.
 */
import type { Rol } from "./esquemas";

export type Accion =
  | "encargo.crear"
  | "encargo.editar"
  | "expediente.crear"
  | "expediente.editar"
  | "catalogo.editar"
  | "importacion.crear"
  | "plantilla.editar";

const PERMISOS: Record<Accion, readonly Rol[]> = {
  "encargo.crear": ["admin", "auditor"],
  "encargo.editar": ["admin", "auditor"],
  "expediente.crear": ["admin", "auditor"],
  "expediente.editar": ["admin", "auditor"],
  "catalogo.editar": ["admin"],
  "importacion.crear": ["admin", "auditor"],
  "plantilla.editar": ["admin"],
};

export function puede(rol: Rol | null | undefined, accion: Accion): boolean {
  return rol != null && PERMISOS[accion].includes(rol);
}
