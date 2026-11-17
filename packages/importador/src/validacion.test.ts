import { describe, expect, it } from "vitest";
import { construirValidacion, type LecturaIA } from "./validacion";

const tipo = {
  clave: "contrato",
  nombre: "Contrato",
  campos_esperados: [{ clave: "objeto", etiqueta: "Objeto", tipo: "texto_largo" }],
};
const E = "c0000000-0000-4000-8000-000000000001";
const T = "d0000000-0000-4000-8000-000000000001";
const R = "e0000000-0000-4000-8000-000000000001";

const lecturas: LecturaIA[] = [
  {
    id: "x-fecha",
    campo: "fecha_documento",
    valor_crudo: "15/03/2022",
    valor_normalizado: "2022-03-15",
  },
  { id: "x-num", campo: "numero_contrato", valor_crudo: "SOP-1", valor_normalizado: "SOP-1" },
  {
    id: "x-monto",
    campo: "monto",
    valor_crudo: "$1,500,000.00",
    valor_normalizado: { monto: "1500000.00", moneda: "MXN" },
  },
  { id: "x-objeto", campo: "objeto", valor_crudo: "Carretera", valor_normalizado: "Carretera" },
  {
    id: "x-inv1",
    campo: "involucrado_1",
    valor_crudo: "Constructora Uno SA de CV · Proveedor",
    valor_normalizado: {
      nombre: "CONSTRUCTORA UNO",
      nombre_original: "Constructora Uno SA de CV",
      tipo: "persona_moral",
      rol: "proveedor",
    },
  },
  {
    id: "x-inv2",
    campo: "involucrado_2",
    valor_crudo: "Secretaría de Obras · Dependencia contratante",
    valor_normalizado: {
      nombre: "SECRETARIA DE OBRAS",
      nombre_original: "Secretaría de Obras",
      tipo: "dependencia",
      rol: "dependencia",
    },
  },
];

const entrada = (cambios: Record<string, unknown> = {}) => ({
  encargoId: E,
  tipoDocumentoId: T,
  expedienteId: null,
  moneda: "MXN",
  valores: {
    fecha_documento: "2022-03-15",
    numero_contrato: "SOP-1",
    monto: "$1,500,000.00",
    objeto: "Carretera",
  },
  involucrados: [
    {
      tipo: "persona_moral",
      nombre: "Constructora Uno SA de CV",
      rol: "proveedor",
      campoIa: "involucrado_1",
    },
    {
      tipo: "dependencia",
      nombre: "Secretaría de Obras",
      rol: "dependencia",
      campoIa: "involucrado_2",
    },
  ],
  ...cambios,
});
const estados = (c: { decisiones: { extraccion_id: string; estado: string }[] }) =>
  Object.fromEntries(c.decisiones.map((d) => [d.extraccion_id, d.estado]));

describe("construirValidacion", () => {
  it("sin cambios: todo queda validado y no hay datos nuevos", () => {
    const r = construirValidacion(entrada(), tipo, R, lecturas);
    if (!r.ok) throw new Error(r.mensaje);
    expect(new Set(Object.values(estados(r.carga)))).toEqual(new Set(["validado"]));
    expect(r.carga.nuevas).toEqual([]);
    expect(r.carga.involucrados.map((i) => i.campo)).toEqual(["involucrado_1", "involucrado_2"]);
    expect(r.carga.resumen).toBe("Contrato SOP-1");
    expect(r.carga.evento?.atributos.origen).toBe("documento");
    expect(r.carga.evento?.monto).toBe("1500000.00");
  });

  it("cambiar un valor lo corrige; vaciarlo lo rechaza; uno que no leyó la IA es nuevo", () => {
    const r = construirValidacion(
      entrada({
        valores: {
          fecha_documento: "2022-03-15",
          numero_contrato: "SOP-1",
          monto: "1,800,000",
          objeto: "",
          telefono: "55 1234 5678",
        },
      }),
      tipo,
      R,
      lecturas,
    );
    if (!r.ok) throw new Error(r.mensaje);
    expect(estados(r.carga)).toMatchObject({
      "x-fecha": "validado",
      "x-num": "validado",
      "x-monto": "corregido",
      "x-objeto": "rechazado",
    });
    const monto = r.carga.decisiones.find((d) => d.extraccion_id === "x-monto");
    expect(monto?.valor_crudo).toBe("1,800,000");
    expect(monto?.valor_normalizado).toEqual({ monto: "1800000.00", moneda: "MXN" });
    expect(r.carga.nuevas.map((n) => n.campo)).toEqual(["telefono"]);
    expect(r.carga.evento?.monto).toBe("1800000.00");
  });

  it("cambiar la moneda corrige el monto", () => {
    const r = construirValidacion(entrada({ moneda: "USD" }), tipo, R, lecturas);
    if (!r.ok) throw new Error(r.mensaje);
    expect(estados(r.carga)["x-monto"]).toBe("corregido");
  });

  it("involucrados: se emparejan por su lectura aunque cambie el orden o se quite uno", () => {
    const r = construirValidacion(
      entrada({
        involucrados: [
          {
            tipo: "dependencia",
            nombre: "Secretaría de Obras Públicas",
            rol: "dependencia",
            campoIa: "involucrado_2",
          },
          { tipo: "persona_fisica", nombre: "Juan Pérez", rol: "representante_legal" },
        ],
      }),
      tipo,
      R,
      lecturas,
    );
    if (!r.ok) throw new Error(r.mensaje);
    expect(estados(r.carga)).toMatchObject({ "x-inv1": "rechazado", "x-inv2": "corregido" });
    expect(r.carga.involucrados.map((i) => i.campo)).toEqual(["involucrado_2", "involucrado_3"]);
    expect(r.carga.nuevas.map((n) => n.campo)).toEqual(["involucrado_3"]);
    // Con un solo involucrado del evento no se pierde nada: el evento sigue con los dos actuales.
    expect(r.carga.evento?.participantes).toHaveLength(2);
  });

  it("toda lectura recibe una decisión, en el mismo orden", () => {
    const r = construirValidacion(
      entrada({ valores: { numero_contrato: "SOP-1" } }),
      tipo,
      R,
      lecturas,
    );
    if (!r.ok) throw new Error(r.mensaje);
    expect(r.carga.decisiones.map((d) => d.extraccion_id)).toEqual(lecturas.map((l) => l.id));
  });

  it("una misma lectura no sostiene a dos involucrados", () => {
    const r = construirValidacion(
      entrada({
        involucrados: [
          {
            tipo: "persona_moral",
            nombre: "Constructora Uno",
            rol: "proveedor",
            campoIa: "involucrado_1",
          },
          {
            tipo: "persona_moral",
            nombre: "Constructora Dos",
            rol: "socio",
            campoIa: "involucrado_1",
          },
        ],
      }),
      tipo,
      R,
      lecturas,
    );
    expect(r.ok).toBe(false);
  });

  it("los errores de formato se devuelven por campo", () => {
    const r = construirValidacion(
      entrada({ valores: { monto: "mucho dinero" } }),
      tipo,
      R,
      lecturas,
    );
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errores["valores.monto"]).toBe("Monto inválido");
  });
});
