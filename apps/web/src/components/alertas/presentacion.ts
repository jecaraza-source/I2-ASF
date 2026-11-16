export const SEVERIDADES = ["critica", "alta", "media", "baja"] as const;
export type Severidad = (typeof SEVERIDADES)[number];

export const NOMBRE_SEVERIDAD: Record<string, string> = {
  critica: "Crítica",
  alta: "Alta",
  media: "Media",
  baja: "Baja",
};

export const CLASE_SEVERIDAD: Record<string, string> = {
  critica: "border-peligro text-peligro",
  alta: "border-oro text-oro",
  media: "border-azul-medio text-azul-claro",
  baja: "border-linea-2 text-tenue",
};

export const NOMBRE_ESTADO: Record<string, string> = {
  abierta: "Abierta",
  confirmada: "Confirmada",
  descartada: "Descartada",
};
