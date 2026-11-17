import { describe, expect, it } from "vitest";
import { aCsv, celdaCsv } from "./csv";
import { cargaArbol, cargaDocumental, hrefDocumental, leerFiltrosDocumental } from "./documental";

const E = "c0000000-0000-4000-8000-000000000001";
const X = "e0000000-0000-4000-8000-000000000001";

describe("filtros del expediente documental", () => {
  it("lee la URL e ignora lo inválido", () => {
    const f = leerFiltrosDocumental({
      vista: "tiempo",
      expediente: X,
      entidad: "no-es-uuid",
      categoria: "sin",
      estado: "cualquiera",
      desde: "2022-01-01",
      hasta: "31/12/2022",
      q: "  contrato  ",
      pagina: "3",
    });
    expect(f).toMatchObject({
      vista: "tiempo",
      expediente: X,
      entidad: undefined,
      categoria: "sin",
      estado: undefined,
      desde: "2022-01-01",
      hasta: undefined,
      q: "contrato",
      pagina: 3,
    });
    expect(leerFiltrosDocumental({ vista: "otra" }).vista).toBe("expediente");
  });

  it("la vista por entidad cruza expedientes; la línea de tiempo ordena por fecha ascendente", () => {
    const f = leerFiltrosDocumental({
      vista: "entidad",
      expediente: X,
      entidad: X,
      orden: "estado",
    });
    expect(cargaDocumental(E, f)).toEqual({
      encargo_id: E,
      entidad_id: X,
      orden: "estado",
      dir: "desc",
    });
    const t = leerFiltrosDocumental({ vista: "tiempo", orden: "estado", dir: "desc" });
    expect(cargaDocumental(E, t, { limite: 50, desplazamiento: 100 })).toMatchObject({
      orden: "fecha",
      dir: "asc",
      limite: 50,
      desplazamiento: 100,
    });
  });

  it("el árbol recibe los filtros que no son del árbol", () => {
    const f = leerFiltrosDocumental({ expediente: X, entidad: X, categoria: "sin", q: "c-1" });
    expect(cargaArbol(E, f)).toEqual({ encargo_id: E, q: "c-1" });
  });

  it("los enlaces conservan los filtros y vuelven a la página 1 al cambiar uno", () => {
    const f = leerFiltrosDocumental({ q: "c-1", pagina: "4", estado: "validados" });
    expect(hrefDocumental("/r", f)).toBe("/r?estado=validados&q=c-1&pagina=4");
    expect(hrefDocumental("/r", f, { vista: "tiempo" })).toBe(
      "/r?vista=tiempo&estado=validados&q=c-1",
    );
    expect(hrefDocumental("/r", f, { pagina: 5 })).toBe("/r?estado=validados&q=c-1&pagina=5");
    expect(hrefDocumental("/r", leerFiltrosDocumental({}))).toBe("/r");
  });
});

describe("CSV", () => {
  it("neutraliza fórmulas y escapa comillas, comas y saltos", () => {
    expect(celdaCsv('=HYPERLINK("http://x")')).toBe(`"'=HYPERLINK(""http://x"")"`);
    expect(celdaCsv("+52 55 1234")).toBe("'+52 55 1234");
    expect(celdaCsv("-1")).toBe("'-1");
    expect(celdaCsv("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(celdaCsv("Constructora, SA")).toBe('"Constructora, SA"');
    expect(celdaCsv("dos\nlíneas")).toBe('"dos\nlíneas"');
    expect(celdaCsv(-1500.5)).toBe("-1500.5");
    expect(celdaCsv(null)).toBe("");
  });

  it("arma el archivo con BOM y CRLF", () => {
    expect(aCsv(["a", "b"], [["1", "x,y"]])).toBe('﻿a,b\r\n1,"x,y"\r\n');
  });
});
