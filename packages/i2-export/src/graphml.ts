import { extremosEvento } from "./csv";
import { NOMBRE_NIVEL, NOMBRE_TIPO_ENTIDAD, type RedExport } from "./tipos";

/** Quita caracteres que XML 1.0 no admite y escapa los especiales. */
export function escaparXml(valor: unknown): string {
  return (
    String(valor ?? "")
      // eslint-disable-next-line no-control-regex
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;")
  );
}

type Llave = {
  id: string;
  para: "node" | "edge";
  nombre: string;
  tipo: "string" | "double" | "int";
};

const LLAVES: Llave[] = [
  { id: "n_nombre", para: "node", nombre: "nombre", tipo: "string" },
  { id: "n_tipo", para: "node", nombre: "tipo", tipo: "string" },
  { id: "n_rfc", para: "node", nombre: "rfc", tipo: "string" },
  { id: "n_curp", para: "node", nombre: "curp", tipo: "string" },
  { id: "n_riesgo", para: "node", nombre: "riesgo_declarado", tipo: "string" },
  { id: "n_nivel", para: "node", nombre: "nivel", tipo: "string" },
  { id: "n_puntaje", para: "node", nombre: "puntaje", tipo: "double" },
  { id: "e_clase", para: "edge", nombre: "clase", tipo: "string" },
  { id: "e_tipo", para: "edge", nombre: "tipo", tipo: "string" },
  { id: "e_fuerza", para: "edge", nombre: "fuerza", tipo: "double" },
  { id: "e_fecha", para: "edge", nombre: "fecha", tipo: "string" },
  { id: "e_nivel", para: "edge", nombre: "nivel", tipo: "string" },
  { id: "e_monto", para: "edge", nombre: "monto", tipo: "double" },
  { id: "e_moneda", para: "edge", nombre: "moneda", tipo: "string" },
];

const dato = (llave: string, valor: unknown) =>
  valor === null || valor === undefined || valor === ""
    ? ""
    : `\n      <data key="${llave}">${escaparXml(valor)}</data>`;

/**
 * GraphML estándar (http://graphml.graphdrawing.org): abre en Gephi, yEd, Cytoscape y NetworkX.
 * Vínculos declarados con `clase = vinculo`; eventos con `clase = evento`.
 */
export function graphml(red: RedExport): string {
  const enRed = new Set(red.entidades.map((e) => e.id));
  const partes: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<graphml xmlns="http://graphml.graphdrawing.org/xmlns" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">',
    ...LLAVES.map(
      (k) => `  <key id="${k.id}" for="${k.para}" attr.name="${k.nombre}" attr.type="${k.tipo}"/>`,
    ),
    `  <graph id="${escaparXml(red.red.id)}" edgedefault="undirected">`,
  ];
  for (const e of red.entidades) {
    partes.push(
      `    <node id="${escaparXml(e.id)}">${dato("n_nombre", e.nombre)}${dato("n_tipo", NOMBRE_TIPO_ENTIDAD[e.tipo] ?? e.tipo)}${dato("n_rfc", e.rfc)}${dato("n_curp", e.curp)}${dato("n_riesgo", e.riesgo_declarado)}${dato("n_nivel", NOMBRE_NIVEL[e.nivel])}${dato("n_puntaje", e.puntaje)}\n    </node>`,
    );
  }
  for (const v of red.vinculos) {
    if (!enRed.has(v.origen_id) || !enRed.has(v.destino_id)) continue;
    partes.push(
      `    <edge id="${escaparXml(v.id)}" source="${escaparXml(v.origen_id)}" target="${escaparXml(v.destino_id)}" directed="${v.dirigido}">${dato("e_clase", "vinculo")}${dato("e_tipo", v.tipo)}${dato("e_fuerza", v.fuerza)}${dato("e_fecha", v.fecha_inicio)}${dato("e_nivel", v.nivel ? NOMBRE_NIVEL[v.nivel] : null)}\n    </edge>`,
    );
  }
  for (const ev of red.eventos) {
    const ext = extremosEvento(ev, enRed);
    if (!ext) continue;
    partes.push(
      `    <edge id="${escaparXml(ev.id)}" source="${escaparXml(ext[0].entidad_id)}" target="${escaparXml(ext[1].entidad_id)}" directed="true">${dato("e_clase", "evento")}${dato("e_tipo", ev.tipo)}${dato("e_fecha", ev.fecha)}${dato("e_monto", ev.monto)}${dato("e_moneda", ev.moneda)}\n    </edge>`,
    );
  }
  partes.push("  </graph>", "</graphml>");
  return `${partes.join("\n")}\n`;
}
