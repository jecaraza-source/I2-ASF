import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodificarTexto, leerLista69b, situacionDe, tablaDeCsv } from "./lista69b";

const FIXTURE = join(__dirname, "..", "..", "..", "fixtures", "lista_69b_prueba.csv");

describe("lista 69-B", () => {
  it("lee el CSV del SAT en Windows-1252, con títulos antes del encabezado", () => {
    const texto = decodificarTexto(new Uint8Array(readFileSync(FIXTURE)));
    expect(texto).toContain("Situación del contribuyente");
    const r = leerLista69b(tablaDeCsv(texto));
    if (!r.ok) throw new Error(r.motivo);
    expect(r.filas.map((f) => [f.rfc, f.situacion])).toEqual([
      ["EFO190101AB1", "definitivo"],
      ["PRE200202CD2", "presunto"],
      ["DES210303EF3", "desvirtuado"],
      ["SEN220404GH4", "sentencia_favorable"],
      ["NOM230505JK5", "presunto"],
    ]);
    expect(r.filas[0]).toMatchObject({
      nombre: "EMPRESA FACTURADORA DE PRUEBA, S.A. DE C.V.",
      nombre_normalizado: "EMPRESA FACTURADORA DE PRUEBA",
      datos: {
        "Número y fecha de oficio global de presunción SAT": "500-05-2023-1234 de fecha 01/02/2023",
        "Publicación DOF definitivos": "15/06/2023",
      },
    });
    expect(r.descartadas).toEqual([{ fila: 8, motivo: "RFC inválido" }]);
    expect(r.repetidas).toBe(1);
  });

  it("acepta una tabla de Excel con fechas y columnas en otro orden", () => {
    const r = leerLista69b([
      ["Situación del contribuyente", "Nombre del Contribuyente", "RFC", "Fecha"],
      ["DEFINITIVO", "Una Empresa SA", "UNA010101AB1", new Date("2024-01-02T00:00:00Z")],
    ]);
    if (!r.ok) throw new Error(r.motivo);
    expect(r.filas[0]).toMatchObject({
      rfc: "UNA010101AB1",
      situacion: "definitivo",
      datos: { Fecha: "2024-01-02" },
    });
  });

  it("rechaza un archivo que no es la lista", () => {
    expect(
      leerLista69b([
        ["A", "B"],
        ["1", "2"],
      ]),
    ).toMatchObject({ ok: false });
    expect(
      leerLista69b([
        ["RFC", "Situación", "Nombre"],
        ["MAL", "Presunto", "X"],
      ]),
    ).toEqual({
      ok: false,
      motivo: "El archivo no tiene filas con RFC válido.",
    });
  });

  it("CSV con comillas, punto y coma y saltos de línea dentro de una celda", () => {
    expect(tablaDeCsv('a;"b;c";"d ""e"""\r\n"f\ng";h')).toEqual([
      ["a", "b;c", 'd "e"'],
      ["f\ng", "h"],
    ]);
  });

  it("situación por texto, con o sin acentos", () => {
    expect(situacionDe("Sentencia Favorable")).toBe("sentencia_favorable");
    expect(situacionDe("presunto")).toBe("presunto");
    expect(situacionDe("Definitivo")).toBe("definitivo");
    expect(situacionDe("DESVIRTUADO")).toBe("desvirtuado");
    expect(situacionDe("")).toBe("otro");
  });
});
