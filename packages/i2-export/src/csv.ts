import { aCsv } from "@sigma/modelo";
import { NOMBRE_NIVEL, NOMBRE_TIPO_ENTIDAD, type EventoExport, type RedExport } from "./tipos";

/** Tipo de entidad de i2 Analyst's Notebook sugerido para cada tipo de SIGMA. */
export const TIPO_I2: Record<string, string> = {
  persona_fisica: "Person",
  persona_moral: "Organization",
  cuenta: "Account",
  domicilio: "Address",
  telefono: "Phone",
  dependencia: "Organization",
  otro: "Unknown",
};

const tipoI2 = (t: string) => TIPO_I2[t] ?? "Unknown";

export const COLUMNAS_ENTIDADES = [
  "ID",
  "Nombre",
  "Tipo",
  "Tipo i2",
  "RFC",
  "CURP",
  "Teléfono",
  "Riesgo declarado",
  "Nivel",
  "Puntaje",
  "Criterios",
] as const;

export const COLUMNAS_VINCULOS = [
  "ID",
  "Entidad 1 ID",
  "Entidad 1",
  "Entidad 2 ID",
  "Entidad 2",
  "Tipo",
  "Dirigido",
  "Fuerza",
  "Fecha",
  "Nivel",
  "Puntaje",
] as const;

export const COLUMNAS_EVENTOS = [
  "ID",
  "Entidad 1 ID",
  "Entidad 1",
  "Rol 1",
  "Entidad 2 ID",
  "Entidad 2",
  "Rol 2",
  "Tipo",
  "Fecha",
  "Monto",
  "Moneda",
  "Participantes",
] as const;

export function entidadesCsv(red: RedExport): string {
  return aCsv(
    COLUMNAS_ENTIDADES,
    red.entidades.map((e) => [
      e.id,
      e.nombre,
      NOMBRE_TIPO_ENTIDAD[e.tipo] ?? e.tipo,
      tipoI2(e.tipo),
      e.rfc ?? "",
      e.curp ?? "",
      e.telefono ?? "",
      e.riesgo_declarado ?? "",
      NOMBRE_NIVEL[e.nivel],
      e.puntaje,
      e.criterios.map((c) => `${c.detalle} (+${c.aporte})`).join("; "),
    ]),
  );
}

export function vinculosCsv(red: RedExport): string {
  const nombre = new Map(red.entidades.map((e) => [e.id, e.nombre]));
  return aCsv(
    COLUMNAS_VINCULOS,
    red.vinculos.map((v) => [
      v.id,
      v.origen_id,
      nombre.get(v.origen_id) ?? "",
      v.destino_id,
      nombre.get(v.destino_id) ?? "",
      v.tipo,
      v.dirigido ? "Sí" : "No",
      v.fuerza ?? "",
      v.fecha_inicio ?? "",
      v.nivel ? NOMBRE_NIVEL[v.nivel] : "",
      v.puntaje ?? "",
    ]),
  );
}

/** Quien envía o llama va primero: así el vínculo de i2 apunta en el sentido del flujo. */
const ORDEN_ROL = ["origen", "emisor", "ordenante", "llamante", "contratante", "dependencia"];
const rango = (rol: string) => {
  const i = ORDEN_ROL.indexOf(rol);
  return i < 0 ? ORDEN_ROL.length : i;
};

/**
 * Extremos de un evento como vínculo de i2: los dos primeros participantes por rol. Un evento con
 * un solo participante dentro de la red no se puede dibujar como vínculo y se omite.
 */
export function extremosEvento(
  e: EventoExport,
  enRed: Set<string>,
): [{ entidad_id: string; rol: string }, { entidad_id: string; rol: string }] | null {
  const ps = e.participantes
    .filter((p) => enRed.has(p.entidad_id))
    .sort((a, b) => rango(a.rol) - rango(b.rol));
  const distintos = ps.filter((p, i) => ps.findIndex((q) => q.entidad_id === p.entidad_id) === i);
  const [a, b] = distintos;
  return a && b ? [a, b] : null;
}

export function eventosCsv(red: RedExport): string {
  const nombre = new Map(red.entidades.map((e) => [e.id, e.nombre]));
  const enRed = new Set(nombre.keys());
  const filas: unknown[][] = [];
  for (const e of red.eventos) {
    const ext = extremosEvento(e, enRed);
    if (!ext) continue;
    const [a, b] = ext;
    filas.push([
      e.id,
      a.entidad_id,
      nombre.get(a.entidad_id) ?? "",
      a.rol,
      b.entidad_id,
      nombre.get(b.entidad_id) ?? "",
      b.rol,
      e.tipo,
      e.fecha ?? "",
      e.monto ?? "",
      e.moneda ?? "",
      e.participantes.length,
    ]);
  }
  return aCsv(COLUMNAS_EVENTOS, filas);
}
