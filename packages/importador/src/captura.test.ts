import { describe, expect, it } from "vitest";
import {
  CAMPOS_COMUNES,
  camposComunesDe,
  camposDelTipo,
  construirCaptura,
  leerCamposEsperados,
} from "./captura";

const ENCARGO = "c0000000-0000-4000-8000-000000000001";
const TIPO = "d0000000-0000-4000-8000-000000000001";
const contrato = {
  clave: "contrato",
  nombre: "Contrato",
  campos_esperados: [
    { clave: "objeto", etiqueta: "Objeto del contrato", tipo: "texto_largo" },
    { clave: "monto_pagado", etiqueta: "Monto pagado", tipo: "monto" },
    {
      clave: "tipo_adjudicacion",
      etiqueta: "Tipo de adjudicación",
      tipo: "texto",
      requerido: true,
    },
  ],
};
const base = {
  encargoId: ENCARGO,
  tipoDocumentoId: TIPO,
  fuente: "Entrevista con el área de obras",
  valores: {
    fecha_documento: "15/03/2022",
    numero_contrato: "SOP-2022-001",
    monto: "$148,500,000.00",
    monto_pagado: "189320000",
    tipo_adjudicacion: "Adjudicación directa",
  },
  involucrados: [
    { tipo: "dependencia", nombre: "Secretaría de Obras Públicas", rol: "dependencia" },
    {
      tipo: "persona_moral",
      nombre: "Grupo Constructor Méndoza, S.A. de C.V.",
      rol: "proveedor",
      rfc: "GCM220101AB1",
    },
  ],
};

describe("construirCaptura", () => {
  it("normaliza fecha mexicana, montos y nombres, y arma el evento de contrato", () => {
    const r = construirCaptura(base, contrato);
    if (!r.ok) throw new Error(r.mensaje);
    const c = r.carga;
    expect(c.fecha_documento).toBe("2022-03-15");
    expect(c.resumen).toBe("Contrato SOP-2022-001 (captura manual)");
    expect(c.campos.find((x) => x.campo === "monto")).toMatchObject({
      valor_crudo: "$148,500,000.00",
      valor_normalizado: { monto: "148500000.00", moneda: "MXN" },
    });
    expect(c.involucrados[1]).toMatchObject({
      nombre: "Grupo Constructor Méndoza, S.A. de C.V.",
      nombre_normalizado: "GRUPO CONSTRUCTOR MENDOZA",
      identificadores: { rfc: "GCM220101AB1" },
    });
    expect(c.evento).toMatchObject({
      tipo: "contrato",
      fecha_hora: "2022-03-15T00:00:00-06:00",
      monto: "148500000.00",
      moneda: "MXN",
      atributos: { numero: "SOP-2022-001", monto_pagado: "189320000.00", origen: "captura" },
      participantes: [
        { indice: 0, rol: "origen" },
        { indice: 1, rol: "destino" },
      ],
    });
    // Cada involucrado deja su propia extracción (trazabilidad).
    expect(c.campos.filter((x) => x.campo.startsWith("involucrado_"))).toHaveLength(2);
  });

  it("la fuente declarada es obligatoria", () => {
    const r = construirCaptura({ ...base, fuente: "  " }, contrato);
    expect(r).toMatchObject({
      ok: false,
      errores: { fuente: "La fuente declarada es obligatoria" },
    });
  });

  it("marca campos requeridos, fechas y montos inválidos sin guardar nada", () => {
    const r = construirCaptura(
      { ...base, valores: { fecha_documento: "31/02/2022", monto: "mucho" } },
      contrato,
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(Object.keys(r.errores).sort()).toEqual([
      "valores.fecha_documento",
      "valores.monto",
      "valores.tipo_adjudicacion",
    ]);
  });

  it("un RFC con formato inválido se conserva marcado, no bloquea (§5)", () => {
    const r = construirCaptura(
      {
        ...base,
        involucrados: [
          { tipo: "persona_moral", nombre: "Empresa X", rol: "proveedor", rfc: "XXX" },
        ],
      },
      contrato,
    );
    if (!r.ok) throw new Error(r.mensaje);
    expect(r.carga.involucrados[0]?.identificadores).toEqual({ rfc: "XXX", invalidos: ["rfc"] });
    expect(r.carga.evento).toBeNull(); // un solo involucrado no forma un evento
  });

  it("rechaza involucrados repetidos con el mismo rol y capturas vacías", () => {
    const repetido = construirCaptura(
      {
        ...base,
        involucrados: [
          base.involucrados[1],
          { ...base.involucrados[1], nombre: "GRUPO CONSTRUCTOR MENDOZA SA DE CV" },
        ],
      },
      contrato,
    );
    expect(repetido.ok).toBe(false);
    const vacia = construirCaptura(
      { ...base, valores: {}, involucrados: [] },
      { ...contrato, campos_esperados: [] },
    );
    expect(vacia).toMatchObject({
      ok: false,
      mensaje: "Captura al menos un dato o un involucrado.",
    });
  });

  it("un tipo sin evento (acta constitutiva) solo registra datos e involucrados", () => {
    const r = construirCaptura(base, {
      clave: "acta_constitutiva",
      nombre: "Acta constitutiva",
      campos_esperados: [],
    });
    if (!r.ok) throw new Error(r.mensaje);
    expect(r.carga.evento).toBeNull();
    expect(r.carga.campos.some((c) => c.campo === "tipo_adjudicacion")).toBe(false);
  });
});

describe("leerCamposEsperados", () => {
  it("descarta entradas mal formadas, repetidas o que chocan con los campos comunes", () => {
    const campos = leerCamposEsperados([
      { clave: "objeto", etiqueta: "Objeto", tipo: "texto" },
      { clave: "objeto", etiqueta: "Otra vez", tipo: "texto" },
      { clave: "monto", etiqueta: "Choca", tipo: "monto" },
      { clave: "Con Espacios", etiqueta: "x", tipo: "texto" },
      { clave: "raro", etiqueta: "x", tipo: "html" },
      "texto",
    ]);
    expect(campos.map((c) => c.clave)).toEqual(["objeto"]);
    expect(leerCamposEsperados(null)).toEqual([]);
    expect(CAMPOS_COMUNES.map((c) => c.clave)).toContain("fecha_documento");
  });
});

describe("campos comunes por tipo de documento", () => {
  const acta = {
    clave: "acta_constitutiva",
    nombre: "Acta constitutiva",
    campos_esperados: [
      { clave: "objeto_social", etiqueta: "Objeto social", tipo: "texto_largo" },
      { clave: "numero_contrato", oculto: true },
      { clave: "numero_factura", oculto: true },
      { clave: "monto", etiqueta: "Capital social constitutivo" },
      { clave: "domicilio", etiqueta: "Domicilio social", tipo: "numero" },
    ],
  };

  it("renombra y oculta campos comunes sin cambiar su tipo ni tocar los propios", () => {
    const comunes = camposComunesDe(acta.campos_esperados);
    const claves = comunes.map((c) => c.clave);
    expect(claves).not.toContain("numero_contrato");
    expect(claves).not.toContain("numero_factura");
    expect(comunes.find((c) => c.clave === "monto")).toMatchObject({
      etiqueta: "Capital social constitutivo",
      tipo: "monto",
    });
    expect(comunes.find((c) => c.clave === "domicilio")).toMatchObject({
      etiqueta: "Domicilio social",
      tipo: "texto_largo",
    });
    expect(leerCamposEsperados(acta.campos_esperados).map((c) => c.clave)).toEqual([
      "objeto_social",
    ]);
    expect(camposDelTipo(acta.campos_esperados).at(-1)?.clave).toBe("objeto_social");
    expect(camposComunesDe(undefined)).toEqual(CAMPOS_COMUNES);
  });

  it("un campo oculto no se guarda aunque llegue; el capital y las aportaciones se normalizan", () => {
    const r = construirCaptura(
      {
        ...base,
        valores: {
          numero_contrato: "NO-DEBE-QUEDAR",
          monto: "$50,000.00",
          objeto_social: "I. La compraventa de bienes. II. La prestación de servicios.",
        },
        involucrados: [
          { tipo: "persona_fisica", nombre: "Ana Ruiz Gómez", rol: "socio", aportacion: "25,000" },
          { tipo: "persona_fisica", nombre: "Luis Pérez Soto", rol: "comisario" },
        ],
      },
      acta,
    );
    if (!r.ok) throw new Error(r.mensaje);
    expect(r.carga.campos.map((c) => c.campo)).not.toContain("numero_contrato");
    expect(r.carga.campos.find((c) => c.campo === "monto")?.valor_normalizado).toEqual({
      monto: "50000.00",
      moneda: "MXN",
    });
    expect(r.carga.involucrados[0]).toMatchObject({ rol: "socio", aportacion: "25000.00" });
    expect(r.carga.involucrados[1]).toMatchObject({ rol: "comisario", aportacion: null });
    expect(
      r.carga.campos.find((c) => c.campo === "involucrado_1")?.valor_normalizado,
    ).toMatchObject({
      aportacion: { monto: "25000.00", moneda: "MXN" },
    });
  });

  it("una aportación ilegible se marca en su involucrado", () => {
    const r = construirCaptura(
      {
        ...base,
        valores: { monto: "1000" },
        involucrados: [
          { tipo: "persona_fisica", nombre: "Ana Ruiz Gómez", rol: "socio", aportacion: "mucho" },
        ],
      },
      acta,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores["involucrados.0.aportacion"]).toBe("Aportación inválida");
  });
});
