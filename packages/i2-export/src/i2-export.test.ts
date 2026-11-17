import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { detectarPlantilla, importar, plantillaSchema } from "@sigma/importador";
import { leerXlsx } from "@sigma/importador/leer";
import { REGLAS_POR_DEFECTO, calificar, generarRed, type DatosRed } from "@sigma/red";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import { beforeAll, describe, expect, it } from "vitest";
import {
  datosCanonicos,
  disponer,
  entidadesCsv,
  escaparXml,
  especificacionImportacion,
  eventosCsv,
  graphml,
  leerDatosAdjuntos,
  reportePdf,
  sha256Hex,
  textoSeguro,
  vinculosCsv,
  type RedExport,
} from "./index";

const RAIZ = join(__dirname, "..", "..", "..");
const DIR_PLANTILLAS = join(RAIZ, "packages", "importador", "plantillas");
const PLANTILLAS = readdirSync(DIR_PLANTILLAS).map((f) =>
  plantillaSchema.parse(JSON.parse(readFileSync(join(DIR_PLANTILLAS, f), "utf8"))),
);

/** El fixture de lavado convertido en la red exportable, como lo armaría apps/web desde la base. */
async function redDeLavado(): Promise<RedExport> {
  const libro = await leerXlsx(
    readFileSync(join(RAIZ, "fixtures", "Red_Lavado_Dinero_LDN2024047.xlsx")),
  );
  const plantilla = detectarPlantilla(libro, PLANTILLAS);
  if (!plantilla) throw new Error("sin plantilla");
  const r = importar(libro, plantilla);
  const datos: DatosRed = {
    entidades: r.entidades.map((e) => ({
      id: e.clave,
      tipo: e.tipo,
      nombre: e.nombre,
      nombre_normalizado: e.nombre_normalizado,
      identificadores: { ...e.identificadores },
      tipos_declarados: e.atributos.tipos_declarados ?? [],
      riesgo_declarado: e.riesgo_declarado,
      fusionada_en: null,
    })),
    menciones: r.entidades.flatMap((e) =>
      e.apariciones.map((a) => ({ registro_id: a.registro, entidad_id: e.clave })),
    ),
    vinculos: r.vinculos.map((v, i) => ({
      id: `v${i + 1}`,
      origen_id: v.origen,
      destino_id: v.destino,
      tipo: v.tipo,
      fuerza: v.fuerza,
    })),
    eventos: r.eventos.map((e, i) => ({
      id: `ev${i + 1}`,
      tipo: e.tipo,
      etapa: (e.atributos.etapa as string | null) ?? null,
      participantes: e.participantes.map((p) => ({ entidad_id: p.entidad, rol: p.rol })),
    })),
    alertas: [],
  };
  const red = generarRed(datos, { semillas: "todas", alcance: 1 });
  const cal = new Map(calificar(red, datos, REGLAS_POR_DEFECTO).map((c) => [c.objeto_id, c]));
  const nodos = new Set(red.nodos.map((n) => n.entidad_id));
  return {
    encargo: { id: "enc-1", nombre: "Lavado LDN-2024-047" },
    alcance: { tipo: "red" },
    red: { id: "red-1", generada_en: "2026-11-17T16:00:00Z" },
    entidades: datos.entidades
      .filter((e) => nodos.has(e.id))
      .map((e) => ({
        id: e.id,
        nombre: e.nombre,
        tipo: e.tipo,
        rfc: e.identificadores.rfc ?? null,
        curp: e.identificadores.curp ?? null,
        telefono: e.identificadores.telefono ?? null,
        riesgo_declarado: e.riesgo_declarado,
        nivel: cal.get(e.id)?.nivel ?? "bajo",
        puntaje: cal.get(e.id)?.puntaje ?? 0,
        ajuste_motivo: null,
        criterios: cal.get(e.id)?.criterios ?? [],
      })),
    vinculos: datos.vinculos
      .filter((v) => red.vinculos.includes(v.id))
      .map((v) => ({
        ...v,
        dirigido: false,
        fecha_inicio: null,
        nivel: cal.get(v.id)?.nivel ?? null,
        puntaje: cal.get(v.id)?.puntaje ?? null,
      })),
    eventos: datos.eventos
      .filter((e) => red.eventos.includes(e.id))
      .map((e, i) => ({
        id: e.id,
        tipo: e.tipo,
        fecha: `2024-0${(i % 9) + 1}-15`,
        monto: 1000 * (i + 1),
        moneda: "MXN",
        participantes: e.participantes,
      })),
    alertas: [
      {
        id: "al-1",
        regla: "R10",
        severidad: "critica",
        estado: "abierta",
        titulo: "Proveedor en la lista 69-B como definitivo",
        entidades: [datos.entidades[0]!.id],
      },
    ],
  };
}

/** Texto visible del PDF: pdf-lib escribe cada texto como <hex> Tj dentro de flujos con Flate. */
function textoDelPdf(pdf: Uint8Array): string {
  const binario = Buffer.from(pdf).toString("latin1");
  const partes: string[] = [];
  const re = /stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(binario))) {
    const fin = binario.indexOf("endstream", m.index);
    const crudo = Buffer.from(binario.slice(m.index + m[0].length, fin), "latin1");
    let contenido: string;
    try {
      contenido = inflateSync(crudo).toString("latin1");
    } catch {
      continue;
    }
    for (const t of contenido.matchAll(/<([0-9A-Fa-f]*)> Tj/g)) {
      partes.push(Buffer.from(t[1]!, "hex").toString("latin1"));
    }
  }
  return partes.join("\n");
}

const filas = (csv: string) =>
  csv
    .replace(/^\uFEFF/, "")
    .trimEnd()
    .split("\r\n");

describe("exportación del fixture de lavado (LDN-2024-047)", () => {
  let red: RedExport;
  beforeAll(async () => {
    red = await redDeLavado();
  });

  it("los CSV traen 20 entidades, 25 vínculos y 20 eventos", () => {
    expect(filas(entidadesCsv(red))).toHaveLength(21);
    expect(filas(vinculosCsv(red))).toHaveLength(26);
    expect(filas(eventosCsv(red))).toHaveLength(21);
    expect(filas(entidadesCsv(red))[0]).toBe(
      "ID,Nombre,Tipo,Tipo i2,RFC,CURP,Teléfono,Riesgo declarado,Nivel,Puntaje,Criterios",
    );
  });

  it("el GraphML es XML válido con 20 nodos y 45 aristas", () => {
    const xml = graphml(red);
    expect(XMLValidator.validate(xml)).toBe(true);
    const g = new XMLParser({ ignoreAttributes: false }).parse(xml).graphml.graph;
    expect(g.node).toHaveLength(20);
    expect(g.edge).toHaveLength(45);
  });

  it("el hash impreso en el PDF es el SHA-256 de los datos adjuntos", async () => {
    const datos = datosCanonicos(red);
    const sha256 = await sha256Hex(datos);
    const pdf = await reportePdf(red, {
      folio: "RED-ABCDEF12",
      fecha: "17/11/2026 10:00",
      autor: "auditor@sigma.test",
      organizacion: "Organización de prueba",
      sha256,
      datos,
      creado: new Date("2026-11-17T16:00:00Z"),
    });
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe("%PDF-");
    const adjunto = await leerDatosAdjuntos(pdf);
    expect(adjunto).toBe(datos);
    expect(await sha256Hex(adjunto!)).toBe(sha256);
    const texto = textoDelPdf(pdf);
    expect(texto).toContain(`SHA-256 de los datos exportados: ${sha256}`);
    expect(texto).toContain("Folio RED-ABCDEF12");
    expect(texto).toContain("REPORTE DE RED DE VÍNCULOS");
    expect(texto).toContain("ENTIDADES CON NIVEL Y CRITERIOS");
    expect(texto).toContain("ALERTAS");
    expect(texto).toContain("Proveedor en la lista 69-B como definitivo");
  });

  it("los datos canónicos no dependen del orden de las listas", async () => {
    const otra = {
      ...red,
      entidades: [...red.entidades].reverse(),
      eventos: [...red.eventos].reverse(),
    };
    expect(await sha256Hex(datosCanonicos(otra))).toBe(await sha256Hex(datosCanonicos(red)));
  });

  it("la especificación lista los archivos con su hash y la tabla de tipos de i2", () => {
    const texto = especificacionImportacion(
      red,
      [{ nombre: "entidades.csv", sha256: "a".repeat(64), filas: 20 }],
      { folio: "F-1", fecha: "17/11/2026", autor: "auditor@sigma.test" },
    );
    expect(texto).toContain(`entidades.csv: 20 fila(s) · SHA-256 ${"a".repeat(64)}`);
    expect(texto).toContain("Persona moral → Organization");
    expect(texto).toContain("Entidad - Vínculo - Entidad");
  });

  it("la disposición es determinista y queda en [0, 1]", () => {
    const ids = red.entidades.map((e) => e.id);
    const aristas = red.vinculos.map((v) => [v.origen_id, v.destino_id] as [string, string]);
    const a = disponer(ids, aristas);
    const b = disponer(ids, aristas);
    expect([...a.entries()]).toEqual([...b.entries()]);
    for (const p of a.values()) {
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(1);
    }
  });
});

describe("datos hostiles (regla 6)", () => {
  const red: RedExport = {
    encargo: { id: "e", nombre: "Encargo <script>" },
    alcance: { tipo: "expediente", id: "x", identificador: "EXP-2026-0001" },
    red: { id: "r", generada_en: "2026-11-17T16:00:00Z" },
    entidades: [
      {
        id: "a",
        nombre: '=HYPERLINK("http://x")',
        tipo: "persona_moral",
        rfc: null,
        curp: null,
        telefono: null,
        riesgo_declarado: null,
        nivel: "alto",
        puntaje: 50,
        ajuste_motivo: null,
        criterios: [],
      },
      {
        id: "b",
        nombre: "Ana & <Bob> \u0007 🦊 Ω",
        tipo: "persona_fisica",
        rfc: null,
        curp: null,
        telefono: null,
        riesgo_declarado: null,
        nivel: "bajo",
        puntaje: 0,
        ajuste_motivo: null,
        criterios: [],
      },
    ],
    vinculos: [
      {
        id: "v",
        origen_id: "a",
        destino_id: "b",
        tipo: "socio",
        fuerza: 5,
        dirigido: false,
        fecha_inicio: null,
        nivel: null,
        puntaje: null,
      },
    ],
    eventos: [],
    alertas: [],
  };

  it("el CSV neutraliza fórmulas", () => {
    expect(entidadesCsv(red)).toContain(`'=HYPERLINK(""http://x"")`);
  });

  it("el GraphML escapa y quita caracteres de control", () => {
    const xml = graphml(red);
    expect(XMLValidator.validate(xml)).toBe(true);
    expect(xml).toContain("Ana &amp; &lt;Bob&gt;");
    expect(escaparXml("a\u0000b")).toBe("ab");
  });

  it("el PDF no falla con caracteres fuera de WinAnsi", async () => {
    expect(textoSeguro("Ω 🦊 ñ")).toBe("? ? ñ");
    const datos = datosCanonicos(red);
    const pdf = await reportePdf(red, {
      folio: "EXP-2026-0001-1",
      fecha: "17/11/2026",
      autor: "auditor@sigma.test",
      organizacion: "Org",
      sha256: await sha256Hex(datos),
      datos,
      creado: new Date(0),
    });
    expect(textoDelPdf(pdf)).toContain("Expediente EXP-2026-0001");
  });
});
