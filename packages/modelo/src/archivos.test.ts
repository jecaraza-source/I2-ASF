import { describe, expect, it } from "vitest";
import { contenidoCoincide, esSha256, tipoPorNombre } from "./archivos";

const bytes = (s: string) => new TextEncoder().encode(s);
const tipo = (n: string) => {
  const t = tipoPorNombre(n);
  if (!t) throw new Error("tipo no aceptado");
  return t;
};

describe("archivos del ingreso", () => {
  it("reconoce el tipo por extensión, sin importar mayúsculas", () => {
    expect(tipoPorNombre("Contrato 12.PDF")?.mime).toBe("application/pdf");
    expect(tipoPorNombre("foto.jpeg")?.clase).toBe("imagen");
    expect(tipoPorNombre("correo.eml")?.clase).toBe("correo");
  });
  it("rechaza extensiones no aceptadas (HTML, SVG, ejecutables, sin extensión)", () => {
    for (const n of ["pagina.html", "logo.svg", "virus.exe", "contrato.pdf.js", "sin_extension"])
      expect(tipoPorNombre(n)).toBeNull();
  });
  it("el contenido debe corresponder a la extensión", () => {
    expect(contenidoCoincide(bytes("%PDF-1.7\n..."), tipo("a.pdf"))).toBe(true);
    expect(contenidoCoincide(bytes("<html><script>alert(1)</script>"), tipo("a.pdf"))).toBe(false);
    expect(contenidoCoincide(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]), tipo("a.jpg"))).toBe(true);
    expect(contenidoCoincide(bytes("%PDF-1.7"), tipo("a.png"))).toBe(false);
    expect(contenidoCoincide(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), tipo("a.xlsx"))).toBe(true);
    expect(
      contenidoCoincide(bytes("From: a@b.mx\r\nSubject: Hola\r\n\r\nTexto"), tipo("a.eml")),
    ).toBe(true);
    expect(contenidoCoincide(bytes("%PDF-1.7"), tipo("a.eml"))).toBe(false);
  });
  it("solo PDF e imágenes rasterizadas tienen vista previa", () => {
    expect(tipo("a.pdf").vista_previa).toBe(true);
    expect(tipo("a.xlsx").vista_previa).toBe(false);
    expect(tipo("a.eml").vista_previa).toBe(false);
  });
  it("valida el formato del SHA-256", () => {
    expect(esSha256("a".repeat(64))).toBe(true);
    expect(esSha256("A".repeat(64))).toBe(false);
    expect(esSha256("../" + "a".repeat(61))).toBe(false);
  });
});
