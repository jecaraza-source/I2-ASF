import "server-only";

type ErrorPostgrest = { code?: string } | null;

/**
 * Traduce errores de la base a mensajes para el usuario sin exponer detalles.
 * En los logs solo van el código y el contexto (IDs), nunca datos capturados.
 */
export function mensajeDeError(error: ErrorPostgrest, contexto: string): string {
  const codigo = error?.code ?? "desconocido";
  console.error(`[${contexto}] error de base: ${codigo}`);
  switch (codigo) {
    case "23505":
      return "Ya existe un registro con esos datos.";
    case "42501":
    case "PGRST301":
      return "Tu rol no permite esta acción.";
    case "23503":
      return "Una referencia no es válida para esta organización.";
    case "23514":
      return "Algún dato no cumple las reglas de la plataforma.";
    default:
      return "No se pudo guardar. Intenta de nuevo.";
  }
}
