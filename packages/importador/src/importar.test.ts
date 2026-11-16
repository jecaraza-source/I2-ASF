/**
 * Regresión contra los fixtures (docs/ESPECIFICACION.md §13).
 * Si un cambio altera estos valores, la prueba falla.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { detectarPlantilla, importar, type Libro, type ResultadoImportacion } from "./importar";
import { contar, destinosUnicosConTipo, esWireTransfer, eventosDe, sumaDe } from "./indicadores";
import { leerXlsx } from "./leer";
import { plantillaSchema, type Plantilla } from "./plantilla";
import { generarSqlPlantillas } from "./seed";
import { normalizarNombre, sumarMontos } from "./normalizacion";

const RAIZ = join(__dirname, "..", "..", "..");
const PLANTILLAS: Plantilla[] = readdirSync(join(__dirname, "..", "plantillas"))
  .filter((f) => f.endsWith(".json"))
  .map((f) =>
    plantillaSchema.parse(JSON.parse(readFileSync(join(__dirname, "..", "plantillas", f), "utf8"))),
  );

async function cargar(
  nombre: string,
): Promise<{ libro: Libro; plantilla: Plantilla; r: ResultadoImportacion }> {
  const libro = await leerXlsx(readFileSync(join(RAIZ, "fixtures", `${nombre}.xlsx`)));
  const plantilla = detectarPlantilla(libro, PLANTILLAS);
  if (!plantilla) throw new Error(`Sin plantilla para ${nombre}`);
  return { libro, plantilla, r: importar(libro, plantilla) };
}

const porNombre = (r: ResultadoImportacion, nombre: string) =>
  r.entidades.find((e) => e.nombre_normalizado === normalizarNombre(nombre));

describe("plantillas semilla", () => {
  it("son válidas y el seed está al día con los JSON", () => {
    expect(PLANTILLAS).toHaveLength(3);
    const seed = readFileSync(join(RAIZ, "supabase", "seed_plantillas.sql"), "utf8");
    const jsons = readdirSync(join(__dirname, "..", "plantillas"))
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(__dirname, "..", "plantillas", f), "utf8")));
    expect(seed).toBe(generarSqlPlantillas(jsons));
  });
});

describe("ANALISIS_ASF_EJEMPLO", () => {
  let r: ResultadoImportacion;
  let plantilla: Plantilla;
  beforeAll(async () => {
    ({ r, plantilla } = await cargar("ANALISIS_ASF_EJEMPLO"));
  });

  it("detecta su plantilla", () => {
    expect(plantilla.nombre).toBe("ANALISIS_ASF_EJEMPLO");
  });

  it("20 contratos: original $157,330,000, pagado $165,430,000, diferencia $8,100,000", () => {
    const contratos = eventosDe(r, "contrato");
    expect(contratos).toHaveLength(20);
    const original = sumaDe(contratos);
    const pagado = sumaDe(contratos, "monto_pagado");
    expect(original).toBe("157330000.00");
    expect(pagado).toBe("165430000.00");
    expect(sumarMontos([pagado, `-${original}`])).toBe("8100000.00");
  });

  it("la fila de totales no se lee como contrato pero se guarda como cifra declarada", () => {
    const hoja = r.hojas.find((h) => h.hoja === "CONTRATOS")!;
    expect(hoja.excluidas).toEqual([
      { fila: 23, motivo: "fila de totales" },
      { fila: 24, motivo: "nota" },
    ]);
    const totales = r.cifras.filter((c) => c.ubicacion.hoja === "CONTRATOS");
    expect(totales.map((c) => [c.ubicacion.celda, c.valor, c.es_monto])).toEqual([
      ["I23", "157330000.00", true],
      ["J23", "165430000.00", true],
      ["K23", "8100000.00", false],
    ]);
  });

  it("25 vínculos y 5 entidades únicas fantasma u offshore como destino (no 17)", () => {
    expect(r.vinculos).toHaveLength(25);
    expect(destinosUnicosConTipo(r, /FANTASMA|OFFSHORE/)).toHaveLength(5);
    const filasConEseDestino = r.vinculos.filter((v) =>
      destinosUnicosConTipo(r, /FANTASMA|OFFSHORE/).includes(v.destino),
    );
    expect(filasConEseDestino).toHaveLength(17);
  });

  it("26 movimientos, 9 wire transfers; se excluyen las filas finales de notas", () => {
    const movimientos = eventosDe(r, "transferencia");
    expect(movimientos).toHaveLength(26);
    expect(movimientos.filter(esWireTransfer)).toHaveLength(9);
    expect(r.hojas.find((h) => h.hoja === "FINANCIEROS")!.excluidas).toEqual([
      { fila: 29, motivo: "fila de totales" },
      { fila: 30, motivo: "nota" },
    ]);
  });

  it("conserva el vínculo de parentesco que usará R05", () => {
    const mario = porNombre(r, "MARIO ALBERTO FUENTES CASTILLO")!;
    const rodrigo = porNombre(r, "ING. RODRIGO VARGAS MORENO")!;
    const v = r.vinculos.find((x) => x.origen === mario.clave && x.destino === rodrigo.clave);
    expect(v?.tipo).toBe("FAMILIAR - HERMANO");
    expect(v?.fuerza).toBe(10);
  });

  it("el resumen ejecutivo produce cifras declaradas con su ubicación", () => {
    const cifras = r.cifras.filter((c) => c.ubicacion.hoja === "RESUMEN EJECUTIVO");
    const original = cifras.find((c) => c.concepto === "Total Monto Original Contratado (MXN)");
    expect(original).toMatchObject({
      valor: "157330000.00",
      es_monto: true,
      ubicacion: { celda: "B5" },
    });
    expect(cifras.find((c) => c.concepto === "Total Contratos en Expediente")).toMatchObject({
      valor: "20.00",
      es_monto: false,
    });
    expect(cifras.some((c) => c.valor === "38500000.00")).toBe(true); // "$38.5 MDP" en H-01
  });

  it("ninguna hoja se ignora en silencio", () => {
    expect(r.hojas.map((h) => [h.hoja, h.estado])).toEqual([
      ["CONTRATOS", "procesada"],
      ["VINCULOS", "procesada"],
      ["FINANCIEROS", "procesada"],
      ["RESUMEN EJECUTIVO", "cifras"],
    ]);
  });

  it("cada extracción apunta a su hoja, fila y celda", () => {
    const registro = r.registros.find((x) => x.clave === "CONTRATOS!2")!;
    const proveedor = registro.extracciones.find((e) => e.campo === "PROVEEDOR")!;
    expect(proveedor).toMatchObject({
      valor_crudo: "CONSTRUCTORA ZETA SA DE CV",
      ubicacion: { hoja: "CONTRATOS", fila: 2, celda: "C2" },
    });
    const fecha = registro.extracciones.find((e) => e.campo === "FECHA_FIRMA")!;
    expect(fecha.valor_normalizado).toBe("2022-03-15");
    expect(registro.fecha_documento).toBe("2022-03-15");
  });
});

describe("ASF_Auditoria_Forense_07734", () => {
  let r: ResultadoImportacion;
  beforeAll(async () => {
    ({ r } = await cargar("ASF_Auditoria_Forense_07734"));
  });

  it("12 contratos: original $1,948,320,450 y pagado $1,655,320,000", () => {
    const contratos = eventosDe(r, "contrato");
    expect(contratos).toHaveLength(12);
    expect(sumaDe(contratos)).toBe("1948320450.00");
    expect(sumaDe(contratos, "monto_pagado")).toBe("1655320000.00");
  });

  it("los tres montos del mismo concepto que comparará R02", () => {
    const portada = r.cifras.find((c) => c.ubicacion.hoja === "PORTADA" && c.es_monto);
    expect(portada).toMatchObject({
      valor: "1847320450.00",
      ubicacion: { fila: 22, celda: "C22" },
    });
    expect(portada?.concepto).toMatch(/monto total/i);
    const resumen = r.cifras.find((c) => c.concepto === "MONTO TOTAL AUDITADO ($MXN)");
    expect(resumen).toMatchObject({ valor: "1947320450.00", es_monto: true });
    const detalle = r.cifras.find(
      (c) =>
        c.ubicacion.hoja === "CONTRATOS IRREGULARES" &&
        c.concepto.endsWith("MONTO ORIGINAL ($MXN)"),
    );
    expect(detalle).toMatchObject({ valor: "1948320450.00", ubicacion: { celda: "H16" } });
  });

  it("14 movimientos; 5 wire transfers por $138,500,000 contra $116.5 M del resumen", () => {
    const movimientos = eventosDe(r, "transferencia");
    expect(movimientos).toHaveLength(14);
    const wires = movimientos.filter(esWireTransfer);
    expect(wires).toHaveLength(5);
    expect(sumaDe(wires)).toBe("138500000.00");
    expect(r.cifras.find((c) => c.concepto === "RECURSOS FUGADOS AL EXTERIOR")).toMatchObject({
      valor: "116500000.00",
      es_monto: true,
    });
  });

  it("300 llamadas, ninguna entre Ana Torres Castillo y Carlos Mendoza Ríos pese al vínculo de 87", () => {
    const llamadas = eventosDe(r, "llamada");
    expect(llamadas).toHaveLength(300);
    const ana = porNombre(r, "ANA TORRES CASTILLO")!;
    const carlos = porNombre(r, "CARLOS MENDOZA RÍOS")!;
    const entre = llamadas.filter((l) => {
      const ids = l.participantes.map((p) => p.entidad);
      return ids.includes(ana.clave) && ids.includes(carlos.clave);
    });
    expect(entre).toHaveLength(0);
    const vinculo = r.vinculos.find((v) => v.origen === ana.clave && v.destino === carlos.clave)!;
    const observacion = r.registros
      .find((x) => x.clave === vinculo.registro)!
      .extracciones.find((e) => e.campo === "OBSERVACIONES");
    expect(observacion?.valor_crudo).toContain("87 llamadas");
  });

  it("las llamadas llevan fecha y hora con la zona de México", () => {
    const primera = eventosDe(r, "llamada")[0]!;
    expect(primera.fecha_hora).toBe("2022-01-26T15:15:14-06:00");
    expect(primera.atributos).toMatchObject({ tipo: "LLAMADA SALIENTE", duracion_seg: 295 });
  });

  it("la fuerza textual se convierte a la escala 1–10 y conserva el original", () => {
    expect(r.vinculos).toHaveLength(22);
    const v = r.vinculos[0]!;
    expect(v).toMatchObject({ fuerza: 7, fuerza_original: "ALTO", fecha_inicio: "2022-01-12" });
  });

  it("el proveedor con RFC y su mención por nombre en la red son la misma entidad", () => {
    const grupo = porNombre(r, "GRUPO CONSTRUCTOR MENDOZA SA DE CV")!;
    expect(grupo.identificadores.rfc).toBe("GCM220101ABC");
    expect(grupo.apariciones.map((a) => a.registro)).toContain("RED DE VÍNCULOS!5");
  });

  it("procesa todas las hojas, incluida la de llamadas", () => {
    expect(r.hojas.map((h) => [h.hoja, h.estado])).toEqual([
      ["PORTADA", "cifras"],
      ["ANALISIS TELEFONICO", "procesada"],
      ["CONTRATOS IRREGULARES", "procesada"],
      ["RED DE VÍNCULOS", "procesada"],
      ["MOVIMIENTOS FINANCIEROS", "procesada"],
      ["RESUMEN EJECUTIVO", "cifras"],
    ]);
  });
});

describe("Red_Lavado_Dinero_LDN2024047", () => {
  let r: ResultadoImportacion;
  beforeAll(async () => {
    ({ r } = await cargar("Red_Lavado_Dinero_LDN2024047"));
  });

  it("20 entidades, 25 vínculos, 20 flujos", () => {
    const c = contar(r);
    expect(c.entidades).toBe(20);
    expect(c.vinculos).toBe(25);
    expect(c.transferencias).toBe(20);
  });

  it("resuelve los extremos por ID del archivo y conserva el riesgo declarado", () => {
    const n01 = r.entidades.find((e) => e.atributos.id_archivo === "N01")!;
    expect(n01).toMatchObject({
      nombre: "GRUPO EMPRESARIAL DELTA SA",
      tipo: "persona_moral",
      riesgo_declarado: "CRITICO",
      identificadores: { rfc: "GED200101AAA" },
    });
    const n05 = r.entidades.find((e) => e.atributos.id_archivo === "N05")!;
    expect(n05.identificadores).toEqual({ id_fiscal: "INC-BVI-4432" });
  });

  it("toma el monto de la columna que trae valor, con su moneda", () => {
    const flujos = eventosDe(r, "transferencia");
    expect(flujos[0]).toMatchObject({ monto: "18000000.00", moneda: "MXN" });
    expect(flujos[3]).toMatchObject({ monto: "850000.00", moneda: "USD" });
  });
});
