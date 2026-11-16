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
  sin_llave: "Falta la llave del proveedor en el servidor",
};
