import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  detectarPlantilla,
  importar,
  plantillaSchema,
  rfcValido,
  type ResultadoImportacion,
} from "@sigma/importador";
import { leerXlsx } from "@sigma/importador/leer";
import { beforeAll, describe, expect, it } from "vitest";
import {
  REGLAS,
  constitucionSegunRfc,
  ejecutarReglas,
  r01,
  r02,
  r03,
  r04,
  r05,
  r06,
  r07,
  r08,
  r09,
  r10,
  r11,
  r12,
} from "./reglas";
import type { DatosReglas } from "./tipos";

const RAIZ = join(__dirname, "..", "..", "..");
const DIR = join(RAIZ, "packages", "importador", "plantillas");
const PLANTILLAS = readdirSync(DIR).map((f) =>
  plantillaSchema.parse(JSON.parse(readFileSync(join(DIR, f), "utf8"))),
);

/** Convierte un resultado de importación en los datos que leen las reglas (como lo haría la base). */
function aDatos(r: ResultadoImportacion): DatosReglas {
  return {
    registros: r.registros.map((g) => ({
      id: g.clave,
      hoja: g.hoja,
      resumen: g.resumen,
      extracciones: g.extracciones.map((x, i) => ({
        id: `${g.clave}#${i}`,
        campo: x.campo,
        valor_crudo: x.valor_crudo,
        valor_normalizado: x.valor_normalizado,
        ubicacion: `Hoja ${x.ubicacion.hoja}, fila ${x.ubicacion.fila}, celda ${x.ubicacion.celda}`,
      })),
    })),
    entidades: r.entidades.map((e) => ({
      id: e.clave,
      tipo: e.tipo,
      nombre: e.nombre,
      nombre_normalizado: e.nombre_normalizado,
      rfc: rfcValido(e.identificadores) ?? null,
    })),
    vinculos: r.vinculos.map((v, i) => ({
      id: `v${i + 1}`,
      registro_id: v.registro,
      origen_id: v.origen,
      destino_id: v.destino,
      tipo: v.tipo,
    })),
    eventos: r.eventos.map((e, i) => ({
      id: `ev${i + 1}`,
      registro_id: e.registro,
      tipo: e.tipo,
      fecha: e.fecha_hora ? e.fecha_hora.slice(0, 10) : null,
      monto: e.monto,
      monto_pagado: typeof e.atributos.monto_pagado === "string" ? e.atributos.monto_pagado : null,
      tipo_operacion:
        typeof e.atributos.tipo_operacion === "string" ? e.atributos.tipo_operacion : null,
      participantes: e.participantes.map((p) => ({ entidad_id: p.entidad, rol: p.rol })),
    })),
  };
}

async function datosDe(nombre: string): Promise<DatosReglas> {
  const libro = await leerXlsx(readFileSync(join(RAIZ, "fixtures", `${nombre}.xlsx`)));
  const plantilla = detectarPlantilla(libro, PLANTILLAS);
  if (!plantilla) throw new Error("sin plantilla");
  return aDatos(importar(libro, plantilla));
}

let asf: DatosReglas;
let ejemplo: DatosReglas;
let lavado: DatosReglas;
beforeAll(async () => {
  asf = await datosDe("ASF_Auditoria_Forense_07734");
  ejemplo = await datosDe("ANALISIS_ASF_EJEMPLO");
  lavado = await datosDe("Red_Lavado_Dinero_LDN2024047");
});

const nombre = (d: DatosReglas, id: string) => d.entidades.find((e) => e.id === id)?.nombre;

describe("expediente 07734 (§13)", () => {
  it("R02 alerta con los tres montos: portada, resumen y detalle", () => {
    const a = r02(asf).filter((x) => x.huella.startsWith("R02|monto_contratado"));
    expect(a).toHaveLength(1);
    expect(a[0]?.evidencias.map((e) => e.valor).sort()).toEqual([
      "$1,847,320,450.00",
      "$1,947,320,450.00",
      "$1,948,320,450.00",
    ]);
    expect(new Set(a[0]?.evidencias.map((e) => e.ubicacion?.split(",")[0]))).toEqual(
      new Set(["Hoja PORTADA", "Hoja RESUMEN EJECUTIVO", "Hoja CONTRATOS IRREGULARES"]),
    );
  });

  it("R04 alerta: wire transfers por 138.5 M contra 116.5 M del resumen", () => {
    const a = r04(asf);
    expect(a).toHaveLength(1);
    expect(a[0]?.evidencias.map((e) => e.valor)).toEqual(["$116,500,000.00", "$138,500,000.00"]);
    expect(a[0]?.evidencias[1]?.etiqueta).toContain("5 transferencias al exterior");
  });

  it("R03 alerta: 87 llamadas declaradas contra 0", () => {
    const a = r03(asf);
    expect(a).toHaveLength(1);
    expect(a[0]?.titulo).toBe("Vínculo afirma 87 llamadas y hay 0");
    expect(a[0]?.entidades.map((id) => nombre(asf, id)).sort()).toEqual([
      "ANA TORRES CASTILLO",
      "CARLOS MENDOZA RÍOS",
    ]);
  });

  it("R01 no alerta: los totales coinciden con las 12 filas (la fila 16 no es un contrato)", () => {
    expect(r01(asf)).toEqual([]);
  });

  it("R05 no alerta por cuñados: la nota explica el parentesco", () => {
    expect(r05(asf)).toEqual([]);
  });

  it("R06 marca el contrato pagado por encima del original", () => {
    const a = r06(asf);
    expect(a).toHaveLength(1);
    expect(a[0]?.evidencias.map((e) => e.valor)).toEqual(["$148,500,000.00", "$189,320,000.00"]);
    expect(a[0]?.entidades.map((id) => nombre(asf, id))).toEqual([
      "GRUPO CONSTRUCTOR MENDOZA SA DE CV",
    ]);
  });

  it("R09 usa la fecha del RFC: constituida 73 días antes del contrato", () => {
    const a = r09(asf);
    const mendoza = a.find((x) => x.titulo.includes("73 días"));
    expect(mendoza?.descripcion).toContain("01/01/2022");
    expect(a.every((x) => x.entidades.length === 1)).toBe(true);
  });
});

describe("ANALISIS_ASF_EJEMPLO (§13)", () => {
  it("R05 marca el parentesco con apellidos distintos", () => {
    const a = r05(ejemplo);
    expect(a).toHaveLength(1);
    expect(a[0]?.entidades.map((id) => nombre(ejemplo, id)).sort()).toEqual([
      "ING. RODRIGO VARGAS MORENO",
      "MARIO ALBERTO FUENTES CASTILLO",
    ]);
    expect(a[0]?.descripcion).toContain("FUENTES CASTILLO / VARGAS MORENO");
  });

  it("R01 no produce falsos positivos por la fila de totales", () => {
    expect(r01(ejemplo)).toEqual([]);
  });

  it("R03 no contrasta afirmaciones sobre contratos (no unen a las dos partes del vínculo)", () => {
    expect(r03(ejemplo)).toEqual([]);
  });

  it("R02 no alerta: resumen y detalle coinciden", () => {
    expect(r02(ejemplo)).toEqual([]);
  });

  it("R04: 9 wire transfers contra 8 reportadas y flujos por 56.68 M contra 44.52 M", () => {
    const a = r04(ejemplo).map((x) => x.evidencias.map((e) => e.valor).join(" vs "));
    expect(a.sort()).toEqual(["$44,520,000.00 vs $56,680,000.00", "8 vs 9"]);
  });

  it("R06 ignora «sin modificatorio» como si fuera un convenio", () => {
    const a = r06(ejemplo);
    expect(a.length).toBeGreaterThanOrEqual(3);
    expect(
      a.some((x) => x.evidencias[0]?.valor === "$4,500,000.00" && x.severidad === "critica"),
    ).toBe(true);
  });

  it("R07 agrupa las adjudicaciones directas por proveedor", () => {
    const a = r07(ejemplo);
    const zeta = a.find(
      (x) => nombre(ejemplo, x.entidades[0] ?? "") === "CONSTRUCTORA ZETA SA DE CV",
    );
    expect(zeta?.evidencias).toHaveLength(4);
    expect(zeta?.severidad).toBe("alta");
  });
});

describe("red de lavado", () => {
  it("sin contratos ni cifras, R01–R07 y R09 no alertan", () => {
    for (const r of [r01, r02, r03, r04, r05, r06, r07, r09]) expect(r(lavado)).toEqual([]);
  });
});

describe("casos sintéticos", () => {
  const base: DatosReglas = {
    registros: [
      {
        id: "r1",
        hoja: "V",
        resumen: "Vínculo",
        extracciones: [
          {
            id: "x1",
            campo: "TIPO",
            valor_crudo: "REPRESENTANTE LEGAL",
            valor_normalizado: null,
            ubicacion: null,
          },
        ],
      },
      {
        id: "r2",
        hoja: "V",
        resumen: "Vínculo",
        extracciones: [
          {
            id: "x2",
            campo: "TIPO",
            valor_crudo: "APODERADO",
            valor_normalizado: null,
            ubicacion: null,
          },
        ],
      },
      {
        id: "r3",
        hoja: "T",
        resumen: "Totales",
        extracciones: [
          {
            id: "x3",
            campo: "total_declarado",
            valor_crudo: "100",
            valor_normalizado: { concepto: "D · MONTO", valor: "100.00", es_monto: true },
            ubicacion: null,
          },
        ],
      },
      {
        id: "r4",
        hoja: "D",
        resumen: "Fila",
        extracciones: [
          {
            id: "x4",
            campo: "MONTO",
            valor_crudo: "60",
            valor_normalizado: "60.00",
            ubicacion: null,
          },
        ],
      },
      {
        id: "r5",
        hoja: "D",
        resumen: "Fila",
        extracciones: [
          {
            id: "x5",
            campo: "MONTO",
            valor_crudo: "30",
            valor_normalizado: "30.00",
            ubicacion: null,
          },
        ],
      },
    ],
    entidades: [
      {
        id: "p",
        tipo: "persona_fisica",
        nombre: "JUAN PÉREZ",
        nombre_normalizado: "JUAN PEREZ",
        rfc: null,
      },
      { id: "a", tipo: "persona_moral", nombre: "ALFA SA", nombre_normalizado: "ALFA", rfc: null },
      { id: "b", tipo: "persona_moral", nombre: "BETA SA", nombre_normalizado: "BETA", rfc: null },
    ],
    vinculos: [
      { id: "v1", registro_id: "r1", origen_id: "p", destino_id: "a", tipo: "REPRESENTANTE LEGAL" },
      { id: "v2", registro_id: "r2", origen_id: "b", destino_id: "p", tipo: "APODERADO" },
    ],
    eventos: [],
  };

  it("R08: el mismo representante en dos proveedores", () => {
    const a = r08(base);
    expect(a).toHaveLength(1);
    expect(a[0]?.entidades).toEqual(["p", "a", "b"]);
    expect(a[0]?.evidencias).toHaveLength(2);
  });

  it("R01: total 100 contra detalle 90", () => {
    const a = r01(base);
    expect(a).toHaveLength(1);
    expect(a[0]?.evidencias.map((e) => e.valor)).toEqual(["$100.00", "$90.00"]);
  });

  it("constitucionSegunRfc elige el siglo y rechaza fechas imposibles", () => {
    expect(constitucionSegunRfc("GCM220101ABC", "2022-03-15")).toBe("2022-01-01");
    expect(constitucionSegunRfc("ABC990230XYZ", "2022-03-15")).toBeNull();
    expect(constitucionSegunRfc("ABC850615XYZ", "2022-03-15")).toBe("1985-06-15");
  });
});

describe("R10: lista 69-B", () => {
  const c = (cambios: Partial<NonNullable<DatosReglas["coincidencias_69b"]>[number]>) => ({
    resultado_id: "r",
    entidad_id: "e",
    coincidencia: "exacta" as const,
    confirmada: false,
    situacion: "definitivo",
    rfc: "EFO190101AB1",
    nombre_en_lista: "EMPRESA FACTURADORA",
    carga: "carga del 31/05/2026 · SHA-256 1a2b3c4d…",
    registro_id: "reg",
    ...cambios,
  });
  const datos = (coincidencias: ReturnType<typeof c>[]): DatosReglas => ({
    registros: [],
    entidades: [
      {
        id: "e",
        tipo: "persona_moral",
        nombre: "Facturadora SA",
        nombre_normalizado: "FACTURADORA",
        rfc: "EFO190101AB1",
      },
    ],
    vinculos: [],
    eventos: [],
    coincidencias_69b: coincidencias,
  });

  it("exacta en definitivo es crítica; en presunto, alta", () => {
    const a = r10(
      datos([c({}), c({ entidad_id: "e", situacion: "presunto", resultado_id: "r2" })]),
    );
    expect(a.map((x) => [x.huella, x.severidad])).toEqual([
      ["R10|e|definitivo", "critica"],
      ["R10|e|presunto", "alta"],
    ]);
    expect(a[0]?.titulo).toBe("Facturadora SA aparece en la lista 69-B del SAT como definitivo");
    expect(a[0]?.descripcion).toContain("por RFC (EFO190101AB1) en la carga del 31/05/2026");
    expect(a[0]?.evidencias[0]).toMatchObject({ lado: "a", registro_id: "reg" });
  });

  it("la propuesta por nombre solo cuenta confirmada; desvirtuado no alerta; sin registro no alerta", () => {
    expect(r10(datos([c({ coincidencia: "propuesta" })]))).toHaveLength(0);
    expect(r10(datos([c({ coincidencia: "propuesta", confirmada: true })]))).toHaveLength(1);
    expect(r10(datos([c({ situacion: "desvirtuado" })]))).toHaveLength(0);
    expect(r10(datos([c({ situacion: "sentencia_favorable" })]))).toHaveLength(0);
    expect(r10(datos([c({ registro_id: null })]))).toHaveLength(0);
  });
});

describe("R11: captura contra su documento asociado", () => {
  const x = (
    id: string,
    campo: string,
    crudo: string,
    normalizado: unknown,
    ubicacion: string,
  ) => ({
    id,
    campo,
    valor_crudo: crudo,
    valor_normalizado: normalizado,
    ubicacion,
  });
  const datos = (lecturas: ReturnType<typeof x>[]): DatosReglas => ({
    entidades: [],
    vinculos: [],
    eventos: [],
    registros: [
      {
        id: "cap",
        hoja: null,
        resumen: "Contrato (captura manual)",
        extracciones: [
          x("m1", "monto", "1,500,000", { monto: "1500000.00", moneda: "MXN" }, "Captura manual"),
          x("m2", "numero_contrato", "SOP-001", "SOP-001", "Captura manual"),
          x("m3", "fecha_documento", "15/03/2022", "2022-03-15", "Captura manual"),
          x("m4", "involucrado_1", "ACME · Proveedor", { nombre: "ACME" }, "Captura manual"),
        ],
        lecturas_documento: lecturas,
      },
      {
        id: "sin-documento",
        hoja: null,
        resumen: null,
        extracciones: [x("z", "monto", "1", "1", "")],
      },
    ],
  });

  it("una alerta por cada campo distinto, con captura y documento lado a lado", () => {
    const a = r11(
      datos([
        x("i1", "monto", "$1,800,000.00", { monto: "1800000.00", moneda: "MXN" }, "Página 2"),
        x("i2", "numero_contrato", "sop 001", "sop 001", "Página 1"),
        x("i3", "fecha_documento", "16 de marzo de 2022", "2022-03-16", "Página 1"),
        x("i4", "involucrado_1", "OTRA · Proveedor", { nombre: "OTRA" }, "Página 1"),
        x("i5", "objeto", "Carretera", "Carretera", "Página 1"),
      ]),
    );
    expect(a.map((al) => [al.huella, al.severidad])).toEqual([
      ["R11|cap|monto", "alta"],
      ["R11|cap|fecha_documento", "media"],
    ]);
    expect(a[0]?.evidencias.map((e) => [e.lado, e.valor, e.extraccion_id, e.ubicacion])).toEqual([
      ["a", "1,500,000", "m1", "Captura manual"],
      ["b", "$1,800,000.00", "i1", "Página 2"],
    ]);
  });

  it("misma cifra en otra moneda sí difiere; sin lecturas no hay alertas", () => {
    expect(
      r11(datos([x("i1", "monto", "1,500,000 USD", { monto: "1500000.00", moneda: "USD" }, "")])),
    ).toHaveLength(1);
    expect(r11(datos([]))).toEqual([]);
  });
});

describe("R12: verificación en campo", () => {
  const cedula = (respuestas: Record<string, string>) => ({
    registros: [],
    entidades: [],
    vinculos: [],
    eventos: [],
    verificaciones_campo: [
      {
        cedula_id: "c1",
        registro_id: "reg-campo",
        entidad_id: "e1",
        entidad: "PROVEEDOR CAMPO SA",
        capturada_en: "2026-11-17T18:30:00Z",
        respuestas,
        evidencias: 2,
      },
    ],
  });
  it("cada «no» es una alerta con su severidad; «no se pudo verificar» no alerta", () => {
    const a = r12(
      cedula({
        domicilio_existe: "si",
        inmueble_existe: "no",
        proveedor_presente: "no",
        actividad_visible: "no",
        persona_confirma: "no_verificable",
      }),
    );
    expect(a.map((x) => [x.huella, x.severidad])).toEqual([
      ["R12|e1|inmueble_existe", "critica"],
      ["R12|e1|proveedor_presente", "critica"],
      ["R12|e1|actividad_visible", "alta"],
    ]);
    expect(a[0]?.titulo).toBe(
      "PROVEEDOR CAMPO SA: no existe un inmueble en el domicilio declarado",
    );
    expect(a[0]?.descripcion).toContain("17/11/2026");
    expect(a[0]?.evidencias[0]?.registro_id).toBe("reg-campo");
    expect(a[0]?.entidades).toEqual(["e1"]);
  });
  it("todo coincide: sin alertas", () => {
    expect(
      r12(
        cedula({
          domicilio_existe: "si",
          inmueble_existe: "si",
          proveedor_presente: "si",
          actividad_visible: "si",
          persona_confirma: "si",
        }),
      ),
    ).toEqual([]);
  });
});

describe("catálogo", () => {
  it("R01–R12 activas", () => {
    expect(REGLAS.map((r) => r.id)).toEqual([
      "R01",
      "R02",
      "R03",
      "R04",
      "R05",
      "R06",
      "R07",
      "R08",
      "R09",
      "R10",
      "R11",
      "R12",
    ]);
    expect(REGLAS.filter((r) => !r.activa).map((r) => r.id)).toEqual([]);
  });
  it("las huellas son únicas y estables entre ejecuciones", () => {
    const a = ejecutarReglas(asf).alertas.map((x) => x.huella);
    expect(new Set(a).size).toBe(a.length);
    expect(ejecutarReglas(asf).alertas.map((x) => x.huella)).toEqual(a);
    expect(ejecutarReglas(asf).reglas).toHaveLength(12);
  });
});
