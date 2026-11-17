import { describe, expect, it } from "vitest";
import {
  CATEGORIAS_MODULO,
  MODULOS,
  RECORRIDOS,
  SENALES_AVANCE,
  moduloPorClave,
  recorridoPorClave,
} from "./catalogo-modulos";

describe("catálogo de módulos", () => {
  it("claves y rutas únicas, categoría válida y descripción corta", () => {
    expect(new Set(MODULOS.map((m) => m.clave)).size).toBe(MODULOS.length);
    expect(new Set(MODULOS.map((m) => m.ruta)).size).toBe(MODULOS.length);
    const categorias = new Set<string>(CATEGORIAS_MODULO.map((c) => c.clave));
    for (const m of MODULOS) {
      expect(categorias.has(m.categoria), m.clave).toBe(true);
      expect(m.descripcion.length, m.clave).toBeGreaterThan(20);
      expect(m.descripcion.length, m.clave).toBeLessThanOrEqual(90);
    }
  });

  it("toda categoría tiene al menos un módulo", () => {
    for (const c of CATEGORIAS_MODULO) {
      expect(
        MODULOS.some((m) => m.categoria === c.clave),
        c.clave,
      ).toBe(true);
    }
  });
});

describe("recorridos", () => {
  it("cinco recorridos con cuatro etapas, módulos y señales del catálogo", () => {
    expect(RECORRIDOS).toHaveLength(5);
    expect(new Set(RECORRIDOS.map((r) => r.clave)).size).toBe(5);
    for (const r of RECORRIDOS) {
      expect(r.clave).toMatch(/^[a-z-]+$/);
      expect(r.etapas, r.clave).toHaveLength(4);
      for (const e of r.etapas) {
        expect(() => moduloPorClave(e.modulo)).not.toThrow();
        if (e.senal) expect(SENALES_AVANCE).toContain(e.senal);
      }
    }
  });

  it("se busca por clave", () => {
    expect(recorridoPorClave("integrar-expediente")?.nombre).toBe("Integrar un expediente");
    expect(recorridoPorClave("no-existe")).toBeUndefined();
  });
});
