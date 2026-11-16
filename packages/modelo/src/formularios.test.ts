import { describe, expect, it } from "vitest";
import {
  categoriaFormSchema,
  encargoFormSchema,
  erroresPorCampo,
  expedienteFormSchema,
  tipoDocumentoFormSchema,
} from "./formularios";
import { puede } from "./permisos";

describe("encargoFormSchema", () => {
  it("convierte campos vacíos en ausentes y aplica valores por defecto", () => {
    const r = encargoFormSchema.parse({
      nombre: "  Auditoría 2024 ",
      tipo_auditoria: "",
      umbral_confianza: "",
      periodo_inicio: "",
      periodo_fin: "",
    });
    expect(r).toEqual({ nombre: "Auditoría 2024", umbral_confianza: 0.85, estado: "activo" });
  });

  it("exige nombre", () => {
    const r = encargoFormSchema.safeParse({ nombre: "   " });
    expect(r.success).toBe(false);
    if (!r.success) expect(erroresPorCampo(r.error).nombre).toEqual(["El nombre es obligatorio"]);
  });

  it("rechaza un periodo invertido y un umbral fuera de rango", () => {
    const r = encargoFormSchema.safeParse({
      nombre: "X",
      umbral_confianza: "1.5",
      periodo_inicio: "2024-12-31",
      periodo_fin: "2024-01-01",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const e = erroresPorCampo(r.error);
      expect(e.umbral_confianza).toBeDefined();
    }
    const r2 = encargoFormSchema.safeParse({
      nombre: "X",
      periodo_inicio: "2024-12-31",
      periodo_fin: "2024-01-01",
    });
    expect(r2.success).toBe(false);
    if (!r2.success) expect(erroresPorCampo(r2.error).periodo_fin).toBeDefined();
  });
});

describe("expedienteFormSchema", () => {
  it("permite omitir el identificador para que la base lo genere", () => {
    expect(expedienteFormSchema.parse({ identificador: " ", numero_control: "" })).toEqual({});
  });

  it("acepta identificadores con guiones y diagonales y rechaza otros símbolos", () => {
    expect(expedienteFormSchema.safeParse({ identificador: "ASF/07734-2024" }).success).toBe(true);
    expect(expedienteFormSchema.safeParse({ identificador: "<script>" }).success).toBe(false);
  });
});

describe("catálogo", () => {
  it("valida la clave del tipo de documento", () => {
    const base = { nombre: "Contrato", categoria_id: "a0000000-0000-4000-8000-000000000001" };
    expect(tipoDocumentoFormSchema.safeParse({ ...base, clave: "contrato" }).success).toBe(true);
    expect(tipoDocumentoFormSchema.safeParse({ ...base, clave: "Contrato Nuevo" }).success).toBe(
      false,
    );
  });

  it("orden de categoría por defecto 0", () => {
    expect(categoriaFormSchema.parse({ nombre: "Fiscal", orden: "" })).toEqual({
      nombre: "Fiscal",
      orden: 0,
    });
  });
});

describe("permisos", () => {
  it("lector no escribe nada", () => {
    for (const a of ["encargo.crear", "expediente.crear", "catalogo.editar"] as const) {
      expect(puede("lector", a)).toBe(false);
    }
  });

  it("auditor opera encargos pero no el catálogo; admin todo", () => {
    expect(puede("auditor", "encargo.crear")).toBe(true);
    expect(puede("auditor", "catalogo.editar")).toBe(false);
    expect(puede("admin", "catalogo.editar")).toBe(true);
  });

  it("sin rol no hay permisos", () => {
    expect(puede(null, "encargo.crear")).toBe(false);
  });
});
