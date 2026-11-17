/** Red lista para exportar: forma independiente de la base (la arma `apps/web`). */

export type NivelExport = "critico" | "alto" | "medio" | "bajo";

export type CriterioExport = { criterio: string; aporte: number; detalle: string };

export type EntidadExport = {
  id: string;
  nombre: string;
  tipo: string;
  rfc: string | null;
  curp: string | null;
  telefono: string | null;
  riesgo_declarado: string | null;
  nivel: NivelExport;
  puntaje: number;
  /** Nivel ajustado por un auditor, con su motivo. */
  ajuste_motivo: string | null;
  criterios: CriterioExport[];
};

export type VinculoExport = {
  id: string;
  origen_id: string;
  destino_id: string;
  tipo: string;
  fuerza: number | null;
  dirigido: boolean;
  fecha_inicio: string | null;
  nivel: NivelExport | null;
  puntaje: number | null;
};

export type EventoExport = {
  id: string;
  tipo: string;
  fecha: string | null;
  monto: number | null;
  moneda: string | null;
  participantes: { entidad_id: string; rol: string }[];
};

export type AlertaExport = {
  id: string;
  regla: string;
  severidad: string;
  estado: string;
  titulo: string;
  entidades: string[];
};

export type RedExport = {
  encargo: { id: string; nombre: string };
  /** De dónde salió: la red completa del encargo o lo que toca a un expediente. */
  alcance: { tipo: "red" } | { tipo: "expediente"; id: string; identificador: string };
  red: { id: string; generada_en: string };
  entidades: EntidadExport[];
  vinculos: VinculoExport[];
  eventos: EventoExport[];
  alertas: AlertaExport[];
};

export const NOMBRE_TIPO_ENTIDAD: Record<string, string> = {
  persona_fisica: "Persona física",
  persona_moral: "Persona moral",
  cuenta: "Cuenta",
  domicilio: "Domicilio",
  telefono: "Teléfono",
  dependencia: "Dependencia",
  otro: "Otro",
};

export const NOMBRE_NIVEL: Record<NivelExport, string> = {
  critico: "Crítico",
  alto: "Alto",
  medio: "Medio",
  bajo: "Bajo",
};
