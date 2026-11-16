import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  detectarPlantilla,
  importar,
  plantillaSchema,
  type ResultadoImportacion,
} from "@sigma/importador";
import { leerXlsx } from "@sigma/importador/leer";
import { beforeAll, describe, expect, it } from "vitest";
import { diferencias, indicadores, proponerFusiones } from "./analisis";
import { REGLAS_POR_DEFECTO, calificar, nivelDe } from "./calificacion";
import { canonicas, generarRed } from "./generacion";
import type { DatosRed, EntidadRed, ReglaCalificacion } from "./tipos";

const RAIZ = join(__dirname, "..", "..", "..");
const DIR_PLANTILLAS = join(RAIZ, "packages", "importador", "plantillas");
const PLANTILLAS = readdirSync(DIR_PLANTILLAS).map((f) =>
  plantillaSchema.parse(JSON.parse(readFileSync(join(DIR_PLANTILLAS, f), "utf8"))),
);

/** Convierte un resultado de importación en los datos que lee la red (como lo haría la base). */
function aDatosRed(r: ResultadoImportacion): DatosRed {
  return {
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
}

async function datosDe(nombre: string): Promise<DatosRed> {
  const libro = await leerXlsx(readFileSync(join(RAIZ, "fixtures", `${nombre}.xlsx`)));
  const plantilla = detectarPlantilla(libro, PLANTILLAS);
  if (!plantilla) throw new Error("sin plantilla");
  return aDatosRed(importar(libro, plantilla));
}

describe("fixture de lavado (LDN-2024-047)", () => {
  let datos: DatosRed;
  beforeAll(async () => {
    datos = await datosDe("Red_Lavado_Dinero_LDN2024047");
  });

  it("la red de todas las entidades tiene 20 nodos y 25 vínculos; los 20 flujos van aparte", () => {
    const red = generarRed(datos, { semillas: "todas", alcance: 1 });
    expect(red.nodos).toHaveLength(20);
    expect(red.vinculos).toHaveLength(25);
    expect(red.eventos).toHaveLength(20);
  });

  it("alcance 1 y 2 desde una semilla crecen por registros que comparten", () => {
    const n14 = datos.entidades.find((e) => e.nombre === "EDGAR VILLANUEVA SOTO")!.id;
    const uno = generarRed(datos, { semillas: [n14], alcance: 1 });
    const dos = generarRed(datos, { semillas: [n14], alcance: 2 });
    expect(uno.nodos.find((n) => n.entidad_id === n14)?.distancia).toBe(0);
    expect(uno.nodos.every((n) => n.distancia <= 1)).toBe(true);
    expect(dos.nodos.length).toBeGreaterThan(uno.nodos.length);
    expect(dos.nodos.some((n) => n.distancia === 2)).toBe(true);
    // Los vínculos de la red solo unen nodos de la red.
    const nodos = new Set(uno.nodos.map((n) => n.entidad_id));
    for (const id of uno.vinculos) {
      const v = datos.vinculos.find((x) => x.id === id)!;
      expect(nodos.has(v.origen_id) && nodos.has(v.destino_id)).toBe(true);
    }
  });

  it("cada calificación explica sus criterios", () => {
    const red = generarRed(datos, { semillas: "todas", alcance: 1 });
    const cal = calificar(red, datos, REGLAS_POR_DEFECTO);
    expect(cal.filter((c) => c.objeto_tipo === "entidad")).toHaveLength(20);
    expect(cal.filter((c) => c.objeto_tipo === "vinculo")).toHaveLength(25);
    const n01 = datos.entidades.find((e) => e.nombre === "GRUPO EMPRESARIAL DELTA SA")!.id;
    const c01 = cal.find((c) => c.objeto_id === n01)!;
    expect(c01.criterios.map((c) => c.criterio)).toContain("riesgo_declarado");
    expect(c01.criterios.find((c) => c.criterio === "riesgo_declarado")?.aporte).toBe(60);
    for (const c of cal) {
      const suma = c.criterios.reduce((s, x) => s + x.aporte, 0);
      expect(c.puntaje).toBe(Math.min(100, suma));
      expect(c.nivel).toBe(nivelDe(c.puntaje));
    }
  });

  it("un vínculo con evento en etapa de lavado suma el criterio de evento", () => {
    const red = generarRed(datos, { semillas: "todas", alcance: 1 });
    const cal = calificar(red, datos, REGLAS_POR_DEFECTO);
    const conEtapa = cal.filter((c) => c.criterios.some((x) => x.criterio === "evento_con_etapa"));
    expect(conEtapa.length).toBeGreaterThan(0);
    expect(conEtapa.every((c) => c.objeto_tipo === "vinculo")).toBe(true);
  });

  it("cambiar un peso produce diferencias visibles contra la generación anterior", () => {
    const red = generarRed(datos, { semillas: "todas", alcance: 1 });
    const antes = calificar(red, datos, REGLAS_POR_DEFECTO);
    const reglas: ReglaCalificacion[] = REGLAS_POR_DEFECTO.map((r) =>
      r.criterio === "fuerza_vinculo" ? { ...r, peso: 5 } : r,
    );
    const despues = calificar(red, datos, reglas);
    const gen = (cs: typeof antes) => ({
      nodos: red.nodos.map((n) => n.entidad_id),
      vinculos: red.vinculos,
      calificaciones: cs,
    });
    const d = diferencias(gen(antes), gen(despues));
    expect(d.bajaron.length).toBeGreaterThan(0);
    expect(d.bajaron.every((c) => c.objeto_tipo === "vinculo")).toBe(true);
    expect(d.nodos_agregados).toEqual([]);
  });
});

describe("ANALISIS_ASF_EJEMPLO", () => {
  it("el indicador de empresas fantasma u offshore da 5 (entidades únicas, no filas)", async () => {
    const datos = await datosDe("ANALISIS_ASF_EJEMPLO");
    const red = generarRed(datos, { semillas: "todas", alcance: 1 });
    const cal = calificar(red, datos, REGLAS_POR_DEFECTO);
    expect(indicadores(red, datos, cal).fantasma_offshore).toBe(5);
    expect(red.vinculos).toHaveLength(25);
  });
});

describe("ASF 07734", () => {
  it("propone fusionar nombres parecidos, nunca los fusiona solo", async () => {
    const datos = await datosDe("ASF_Auditoria_Forense_07734");
    const propuestas = proponerFusiones(datos.entidades, []);
    const nombre = (id: string) => datos.entidades.find((e) => e.id === id)!.nombre;
    const pares = propuestas.map((p) =>
      [nombre(p.entidad_a), nombre(p.entidad_b)].sort().join(" ~ "),
    );
    expect(pares).toContain("CARLOS MENDOZA RÍOS ~ CARLOS MENDOZA RÍOS (PERSONAL)");
    // La red no cambia por proponer: siguen siendo dos nodos distintos.
    expect(new Set(canonicas(datos.entidades).values()).size).toBe(datos.entidades.length);
  });
});

describe("fusiones aceptadas", () => {
  const e = (id: string, nombre: string, extra: Partial<EntidadRed> = {}): EntidadRed => ({
    id,
    tipo: "persona_moral",
    nombre,
    nombre_normalizado: nombre,
    identificadores: {},
    tipos_declarados: [],
    riesgo_declarado: null,
    fusionada_en: null,
    ...extra,
  });

  it("la entidad fusionada se une a la canónica sin reescribir nada", () => {
    const datos: DatosRed = {
      entidades: [
        e("a", "ACME"),
        e("b", "ACME (MX)", { fusionada_en: "a", tipos_declarados: ["EMPRESA FANTASMA"] }),
        e("c", "BETA"),
      ],
      menciones: [
        { registro_id: "r1", entidad_id: "b" },
        { registro_id: "r1", entidad_id: "c" },
      ],
      vinculos: [{ id: "v1", origen_id: "b", destino_id: "c", tipo: "SOCIO", fuerza: 9 }],
      eventos: [],
      alertas: [],
    };
    const red = generarRed(datos, { semillas: ["a"], alcance: 1 });
    expect(red.nodos.map((n) => n.entidad_id).sort()).toEqual(["a", "c"]);
    expect(red.vinculos).toEqual(["v1"]);
    const cal = calificar(red, datos, REGLAS_POR_DEFECTO);
    expect(cal.find((c) => c.objeto_id === "a")?.criterios.map((x) => x.criterio)).toContain(
      "tipo_declarado",
    );
  });

  it("no propone pares con RFC válido distinto ni pares ya resueltos", () => {
    const entidades = [
      e("a", "CONSTRUCTORA NORTE MEXICANA", { identificadores: { rfc: "CNM010101AAA" } }),
      e("b", "CONSTRUCTORA NORTE MEXICANA DEL", { identificadores: { rfc: "CNM020202BBB" } }),
      e("c", "SERVICIOS INTEGRALES DEL GOLFO"),
      e("d", "SERVICIOS INTEGRALES GOLFO"),
    ];
    expect(proponerFusiones(entidades, [])).toHaveLength(1);
    expect(proponerFusiones(entidades, [{ entidad_a: "d", entidad_b: "c" }])).toHaveLength(0);
  });

  it("el ajuste a vínculos fuertes con críticas se suma una vez", () => {
    const datos: DatosRed = {
      entidades: [
        e("a", "A", { riesgo_declarado: "CRÍTICO", tipos_declarados: ["OFFSHORE"] }),
        e("b", "B"),
      ],
      menciones: [
        { registro_id: "r", entidad_id: "a" },
        { registro_id: "r", entidad_id: "b" },
      ],
      vinculos: [
        { id: "v1", origen_id: "a", destino_id: "b", tipo: "X", fuerza: 9 },
        { id: "v2", origen_id: "b", destino_id: "a", tipo: "Y", fuerza: 8 },
      ],
      eventos: [],
      alertas: [],
    };
    const red = generarRed(datos, { semillas: "todas", alcance: 1 });
    const cal = calificar(red, datos, REGLAS_POR_DEFECTO);
    const b = cal.find((c) => c.objeto_id === "b")!;
    expect(b.criterios).toEqual([
      expect.objectContaining({ criterio: "vinculo_fuerte_con_critico", aporte: 10 }),
    ]);
    expect(cal.find((c) => c.objeto_id === "a")).toMatchObject({ puntaje: 90, nivel: "critico" });
  });

  it("alertas abiertas de R06–R10 suman 15 por alerta", () => {
    const datos: DatosRed = {
      entidades: [e("a", "A")],
      menciones: [{ registro_id: "r", entidad_id: "a" }],
      vinculos: [],
      eventos: [],
      alertas: [
        { id: "1", regla: "R07", estado: "abierta", entidades: ["a"] },
        { id: "2", regla: "R08", estado: "abierta", entidades: ["a"] },
        { id: "3", regla: "R02", estado: "abierta", entidades: ["a"] },
        { id: "4", regla: "R09", estado: "descartada", entidades: ["a"] },
      ],
    };
    const red = generarRed(datos, { semillas: "todas", alcance: 1 });
    expect(calificar(red, datos, REGLAS_POR_DEFECTO)[0]).toMatchObject({
      puntaje: 30,
      nivel: "medio",
    });
  });
});
