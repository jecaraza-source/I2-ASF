/** Datos que leen las reglas (forma independiente de la base). Solo registros validados. */

export type ExtraccionRegla = {
  id: string;
  campo: string;
  valor_crudo: string | null;
  valor_normalizado: unknown;
  /** «Hoja X, fila 7, celda C7» o «Página 3». */
  ubicacion: string | null;
};

export type RegistroRegla = {
  id: string;
  hoja: string | null;
  resumen: string | null;
  extracciones: ExtraccionRegla[];
  /**
   * Solo en capturas con documento asociado: lo que la IA leyó del documento. No son datos del
   * registro (no entran a `extracciones`); sirven para compararlos con lo capturado (R11).
   */
  lecturas_documento?: ExtraccionRegla[];
};

export type EntidadRegla = {
  id: string;
  tipo: string;
  nombre: string;
  nombre_normalizado: string;
  /** RFC válido, si lo hay. */
  rfc: string | null;
};

export type VinculoRegla = {
  id: string;
  registro_id: string | null;
  origen_id: string;
  destino_id: string;
  tipo: string;
};

export type EventoRegla = {
  id: string;
  registro_id: string | null;
  tipo: string;
  /** Día aaaa-mm-dd. */
  fecha: string | null;
  monto: string | null;
  monto_pagado: string | null;
  tipo_operacion: string | null;
  participantes: { entidad_id: string; rol: string }[];
};

/** Coincidencia de una entidad con una lista externa (lista 69-B del SAT, §11.1). */
export type CoincidenciaListaRegla = {
  resultado_id: string;
  entidad_id: string;
  coincidencia: "exacta" | "propuesta";
  /** Confirmada por un auditor (una propuesta solo cuenta si se confirma). */
  confirmada: boolean;
  situacion: string;
  rfc: string | null;
  nombre_en_lista: string | null;
  /** «carga del 31/05/2026 · SHA-256 1a2b3c4d…» */
  carga: string | null;
  /** Un registro validado donde aparece la entidad: la evidencia de la alerta. */
  registro_id: string | null;
};

export type DatosReglas = {
  registros: RegistroRegla[];
  entidades: EntidadRegla[];
  vinculos: VinculoRegla[];
  eventos: EventoRegla[];
  coincidencias_69b?: CoincidenciaListaRegla[];
};

export type Severidad = "critica" | "alta" | "media" | "baja";

export type EvidenciaAlerta = {
  /** Las evidencias que se contradicen van en lados distintos. */
  lado: "a" | "b";
  etiqueta: string;
  valor: string;
  registro_id: string;
  extraccion_id: string | null;
  ubicacion: string | null;
};

export type Alerta = {
  regla: string;
  severidad: Severidad;
  titulo: string;
  descripcion: string;
  /** Identidad estable: volver a ejecutar la regla sobre los mismos datos da la misma huella. */
  huella: string;
  /** Entidades señaladas (alimentan la calificación de la red, §9). */
  entidades: string[];
  evidencias: EvidenciaAlerta[];
};

export type Regla = {
  id: string;
  nombre: string;
  activa: boolean;
  /** Por qué está desactivada, si lo está. */
  nota?: string;
  evaluar: (datos: DatosReglas) => Alerta[];
};
