import { COLUMNAS_ENTIDADES, COLUMNAS_EVENTOS, COLUMNAS_VINCULOS, TIPO_I2 } from "./csv";
import { NOMBRE_TIPO_ENTIDAD, type RedExport } from "./tipos";

export type ArchivoFirmado = { nombre: string; sha256: string; filas: number };

/**
 * Especificación de importación para i2 Analyst's Notebook: qué trae cada CSV, qué columna va a
 * cada campo del asistente de importación y qué ícono usar. Texto plano para leerlo en cualquier lado.
 */
export function especificacionImportacion(
  red: RedExport,
  archivos: ArchivoFirmado[],
  meta: { folio: string; fecha: string; autor: string },
): string {
  const lineas: string[] = [];
  const titulo = (t: string) => lineas.push("", t, "-".repeat(t.length));
  lineas.push(
    "ESPECIFICACIÓN DE IMPORTACIÓN · i2 ANALYST'S NOTEBOOK",
    "",
    `Encargo: ${red.encargo.nombre}`,
    `Alcance: ${red.alcance.tipo === "expediente" ? `expediente ${red.alcance.identificador}` : "red completa del encargo"}`,
    `Generación de la red: ${red.red.generada_en}`,
    `Folio: ${meta.folio}`,
    `Fecha: ${meta.fecha}`,
    `Exportó: ${meta.autor}`,
  );

  titulo("Archivos");
  for (const a of archivos) lineas.push(`- ${a.nombre}: ${a.filas} fila(s) · SHA-256 ${a.sha256}`);
  lineas.push(
    "Los CSV van en UTF-8 con BOM, separados por coma, con encabezado en la primera fila.",
    "Una celda de texto que empieza con =, +, -, @ trae un apóstrofo al inicio: es texto, no fórmula.",
  );

  titulo("1. Entidades (entidades.csv)");
  lineas.push(
    "Importar como especificación «Entidad» (una entidad por fila).",
    "- Identidad de la entidad: columna «ID» (estable entre exportaciones).",
    "- Etiqueta: «Nombre».",
    "- Tipo de entidad: columna «Tipo i2», o asignar por «Tipo» con esta tabla:",
  );
  for (const [tipo, i2] of Object.entries(TIPO_I2)) {
    lineas.push(`    ${NOMBRE_TIPO_ENTIDAD[tipo] ?? tipo} → ${i2}`);
  }
  lineas.push(
    "- Atributos: RFC, CURP, Teléfono, Riesgo declarado, Nivel, Puntaje, Criterios.",
    "- Sugerencia: condicionar el color del ícono por «Nivel» (Crítico rojo, Alto naranja, Medio",
    "  amarillo, Bajo verde).",
    `Columnas: ${COLUMNAS_ENTIDADES.join(", ")}.`,
  );

  titulo("2. Vínculos declarados (vinculos.csv)");
  lineas.push(
    "Importar como «Entidad - Vínculo - Entidad».",
    "- Entidad 1: «Entidad 1 ID» como identidad y «Entidad 1» como etiqueta.",
    "- Entidad 2: «Entidad 2 ID» y «Entidad 2».",
    "- Vínculo: etiqueta «Tipo»; dirección con «Dirigido» (Sí = de 1 a 2); grosor por «Fuerza».",
    "- Fecha del vínculo: «Fecha» (AAAA-MM-DD).",
    `Columnas: ${COLUMNAS_VINCULOS.join(", ")}.`,
  );

  titulo("3. Eventos (eventos.csv)");
  lineas.push(
    "Transferencias, llamadas y contratos como vínculos con fecha y monto. Importar también como",
    "«Entidad - Vínculo - Entidad», con «Tipo» como etiqueta, «Fecha» como fecha y «Monto» y «Moneda»",
    "como atributos. El sentido va de «Entidad 1» (origen, emisor o quien llama) a «Entidad 2».",
    "Los eventos con más de dos participantes se exportan con sus dos primeros; «Participantes» dice",
    "cuántos tenía.",
    `Columnas: ${COLUMNAS_EVENTOS.join(", ")}.`,
  );

  titulo("4. Orden sugerido");
  lineas.push(
    "1) entidades.csv  2) vinculos.csv  3) eventos.csv. Al importar vínculos y eventos, usar la misma",
    "identidad («ID») para que i2 una las filas con las entidades ya importadas.",
    "",
    "Alternativa: red.graphml abre en Gephi, yEd o Cytoscape con los mismos atributos.",
  );
  return `${lineas.join("\n")}\n`;
}
