import { describe, expect, it } from "vitest";
import { leerParametrosTabla, limpiarBusqueda, rangoDePagina, totalPaginas } from "./tabla";

const config = {
  columnas: ["nombre", "creado_en"] as const,
  ordenPorDefecto: "creado_en" as const,
};

describe("leerParametrosTabla", () => {
  it("usa valores por defecto con entrada vacía", () => {
    expect(leerParametrosTabla({}, config)).toEqual({
      pagina: 1,
      porPagina: 25,
      orden: "creado_en",
      dir: "asc",
      q: "",
    });
  });

  it("ignora columnas no permitidas y valores fuera de rango", () => {
    const p = leerParametrosTabla(
      { pagina: "-3", por: "9999", orden: "organizacion_id", dir: "drop table" },
      config,
    );
    expect(p).toMatchObject({ pagina: 1, porPagina: 25, orden: "creado_en", dir: "asc" });
  });

  it("respeta parámetros válidos", () => {
    const p = leerParametrosTabla(
      { pagina: "3", por: "50", orden: "nombre", dir: "desc", q: "acme" },
      config,
    );
    expect(p).toEqual({ pagina: 3, porPagina: 50, orden: "nombre", dir: "desc", q: "acme" });
  });
});

describe("limpiarBusqueda", () => {
  it("quita caracteres que alteran filtros de PostgREST", () => {
    expect(limpiarBusqueda("acme),id.eq.1,(x")).toBe("acme id eq 1 x");
    expect(limpiarBusqueda("100% *ok*")).toBe("100 ok");
  });

  it("acota la longitud", () => {
    expect(limpiarBusqueda("a".repeat(500))).toHaveLength(100);
  });
});

describe("paginación", () => {
  it("calcula rango y total de páginas", () => {
    expect(rangoDePagina({ pagina: 2, porPagina: 25 })).toEqual([25, 49]);
    expect(totalPaginas(0, 25)).toBe(1);
    expect(totalPaginas(51, 25)).toBe(3);
  });
});
