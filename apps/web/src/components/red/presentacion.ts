import type { FamiliaArista, Nivel } from "@sigma/red";
import type { Css } from "cytoscape";

export const NOMBRE_TIPO: Record<string, string> = {
  persona_fisica: "Persona física",
  persona_moral: "Persona moral",
  cuenta: "Cuenta",
  domicilio: "Domicilio",
  telefono: "Teléfono",
  dependencia: "Dependencia",
  otro: "Otro",
};

export const NOMBRE_NIVEL: Record<Nivel, string> = {
  critico: "Crítico",
  alto: "Alto",
  medio: "Medio",
  bajo: "Bajo",
};

/**
 * Color de las líneas por familia. Parte de la paleta del prototipo (legacy/), aclarada para que
 * no se pierdan sobre el fondo oscuro.
 */
export const COLOR_FAMILIA: Record<FamiliaArista, string> = {
  propiedad: "#ef7b6a",
  flujo: "#f0d572",
  irregularidad: "#ff9f43",
  familiar: "#c39bff",
  cuenta: "#4fd1c5",
  contractual: "#7ddc8f",
  comunicacion: "#7fb3d8",
  otro: "#a9b6cc",
};

/** Color de una entidad sin calificación (nodo del prototipo). */
export const COLOR_SIN_NIVEL = "#7fb3d8";

/** Paleta del prototipo (legacy/): rojo, ámbar, oro, verde. */
export const COLOR_NIVEL: Record<Nivel, string> = {
  critico: "#c65a4a",
  alto: "#d4872a",
  medio: "#d4af37",
  bajo: "#5aa06f",
};

const glifos: Record<string, string> = {
  persona_fisica: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/>',
  persona_moral:
    '<rect x="5" y="3" width="14" height="18" rx="1"/><path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2M11 21v-3h2v3"/>',
  cuenta: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h4"/>',
  domicilio: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10M10 20v-6h4v6"/>',
  telefono:
    '<path d="M6 3h4l2 5-2.5 1.5a11 11 0 0 0 5 5L16 12l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 4 5a2 2 0 0 1 2-2z"/>',
  dependencia: '<path d="M3 9l9-5 9 5M5 9v9M9.5 9v9M14.5 9v9M19 9v9M3 20h18"/>',
  otro: '<circle cx="12" cy="12" r="3"/>',
};

/** Ícono blanco por tipo de entidad, como data URI para Cytoscape. */
export function iconoTipo(tipo: string): string {
  const cuerpo = glifos[tipo] ?? glifos.otro;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${cuerpo}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

export const FORMA_TIPO: Record<string, Css.NodeShape> = {
  persona_fisica: "ellipse",
  persona_moral: "round-rectangle",
  cuenta: "round-diamond",
  domicilio: "round-hexagon",
  telefono: "round-tag",
  dependencia: "round-octagon",
  otro: "ellipse",
};
