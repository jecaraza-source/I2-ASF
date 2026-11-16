/** Datos de entrada de la red (forma independiente de la base). */

export type Nivel = "critico" | "alto" | "medio" | "bajo";

export type EntidadRed = {
  id: string;
  tipo: string;
  nombre: string;
  nombre_normalizado: string;
  identificadores: {
    rfc?: string;
    curp?: string;
    telefono?: string;
    invalidos?: string[];
  } & Record<string, unknown>;
  tipos_declarados: string[];
  riesgo_declarado: string | null;
  /** Si un auditor aceptó fusionarla, ID de la entidad que la absorbe. */
  fusionada_en: string | null;
};

export type VinculoRed = {
  id: string;
  origen_id: string;
  destino_id: string;
  tipo: string;
  fuerza: number | null;
};

export type EventoRed = {
  id: string;
  tipo: string;
  etapa: string | null;
  participantes: { entidad_id: string; rol: string }[];
};

export type AlertaRed = {
  id: string;
  regla: string;
  estado: string;
  entidades: string[];
};

/** Entidad mencionada por un registro validado (registro_entidad). */
export type Mencion = { registro_id: string; entidad_id: string };

export type DatosRed = {
  entidades: EntidadRed[];
  menciones: Mencion[];
  vinculos: VinculoRed[];
  eventos: EventoRed[];
  alertas: AlertaRed[];
};

export type ReglaCalificacion = {
  criterio: string;
  peso: number;
  parametros: Record<string, unknown>;
};

export type Criterio = { criterio: string; aporte: number; detalle: string };

export type Calificacion = {
  objeto_tipo: "entidad" | "vinculo";
  objeto_id: string;
  puntaje: number;
  nivel: Nivel;
  criterios: Criterio[];
};

export type RedGenerada = {
  semillas: string[];
  alcance: 1 | 2;
  nodos: { entidad_id: string; distancia: number }[];
  vinculos: string[];
  eventos: string[];
};
