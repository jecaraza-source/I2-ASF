/** Proveedores de IA que la plataforma puede usar. Cada encargo decide a cuáles envía documentos. */
export const PROVEEDORES_IA = ["anthropic", "openai"] as const;
export type ProveedorIA = (typeof PROVEEDORES_IA)[number];

export const NOMBRE_PROVEEDOR_IA: Record<ProveedorIA, string> = {
  anthropic: "Anthropic (Claude)",
  openai: "OpenAI (ChatGPT)",
};

/** Por qué `ia_permitida` bloquea una llamada. */
export const MOTIVO_BLOQUEO_IA: Record<string, string> = {
  encargo_inexistente: "El encargo no existe",
  ia_apagada_organizacion: "La IA está apagada para la organización",
  proveedor_no_permitido_en_encargo: "El encargo no permite este proveedor",
  tope_diario: "Se alcanzó el tope diario de tokens",
  tope_mensual: "Se alcanzó el tope mensual de tokens",
  tope_proveedor_diario: "Se alcanzó el tope diario de este proveedor",
  tope_proveedor_mensual: "Se alcanzó el tope mensual de este proveedor",
  sin_llave: "Falta la llave del proveedor en el servidor",
  sin_modelo: "Falta definir el modelo del proveedor en el servidor",
  sin_proveedor: "No hay proveedor de IA disponible",
  tipo_sin_lectura: "Este tipo de archivo no se lee con IA",
  archivo_grande: "El archivo supera el tamaño que la IA puede leer",
};

/** Errores del proveedor de IA, en palabras del usuario (el código queda en `uso_ia`). */
export const ERROR_IA: Record<string, string> = {
  saldo_insuficiente: "La cuenta del proveedor no tiene saldo: recárgala en su consola",
  pdf_demasiadas_paginas: "El PDF tiene más páginas de las que la IA lee de una vez",
  documento_largo: "El documento es demasiado largo para la IA",
  archivo_grande: "El archivo supera el tamaño que la IA puede leer",
  archivo_ilegible: "La IA no pudo abrir el archivo (dañado o protegido)",
  modelo_invalido: "El modelo configurado no existe o no está disponible para la llave",
  esquema_invalido: "El proveedor rechazó el formato de la petición",
  herramienta_forzada: "El modelo no admite la forma de pedir la respuesta (actualiza la app)",
  razonamiento_no_admitido: "El modelo no admite esa configuración de razonamiento",
  invalid_request_error: "El proveedor rechazó la petición",
  authentication_error: "La llave del proveedor no es válida",
  permission_error: "La llave no tiene permiso para ese modelo",
  not_found_error: "El modelo configurado no existe",
  rate_limit_error: "El proveedor llegó a su límite de uso",
  overloaded_error: "El proveedor está saturado",
  tiempo_agotado: "El proveedor tardó demasiado",
  respuesta_invalida: "La respuesta de la IA no tuvo el formato esperado",
};

export function textoErrorIA(codigo: string | null | undefined): string {
  if (!codigo) return "Error";
  return ERROR_IA[codigo] ?? `Error ${codigo}`;
}
