import type { ErroresCampo } from "@sigma/modelo";

/** Resultado de una server action de formulario. */
export type EstadoFormulario = {
  ok: boolean;
  mensaje?: string;
  errores?: ErroresCampo;
  /** Valores enviados, para no perder lo capturado si hay errores. */
  valores?: Record<string, string>;
};

export const ESTADO_INICIAL: EstadoFormulario = { ok: false };

/** Convierte FormData en un objeto de texto (sin archivos). */
export function valoresDe(formData: FormData): Record<string, string> {
  const valores: Record<string, string> = {};
  for (const [clave, valor] of formData.entries()) {
    if (typeof valor === "string" && !clave.startsWith("$")) valores[clave] = valor;
  }
  return valores;
}
