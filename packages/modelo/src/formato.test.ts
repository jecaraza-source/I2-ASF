import { describe, expect, it } from "vitest";
import { formatoBytes, formatoMonto, formatoNumero, formatoPorcentaje } from "./formato";

describe("formato de números", () => {
  it("miles con coma", () => {
    expect(formatoNumero(1234567)).toBe("1,234,567");
    expect(formatoNumero("50000")).toBe("50,000");
    expect(formatoNumero(1234.5, 2)).toBe("1,234.50");
    expect(formatoNumero(12.345)).toBe("12.35");
    expect(formatoNumero(null)).toBe("—");
    expect(formatoNumero("F-12")).toBe("F-12");
  });

  it("montos con moneda y signo, sin perder precisión", () => {
    expect(formatoMonto("1948320450")).toBe("$1,948,320,450.00");
    expect(formatoMonto("-8100000.5")).toBe("-$8,100,000.50");
    expect(formatoMonto("123456789012345678.99")).toBe("$123,456,789,012,345,678.99");
    expect(formatoMonto(12500, "USD")).toBe("US$12,500.00");
    expect(formatoMonto("1200", "CHF")).toBe("1,200.00 CHF");
    expect(formatoMonto("0.5", "EUR")).toBe("€0.50");
    expect(formatoMonto(null)).toBe("—");
    expect(formatoMonto("n/d", "MXN")).toBe("n/d MXN");
  });

  it("porcentajes", () => {
    expect(formatoPorcentaje(0.85)).toBe("85%");
    expect(formatoPorcentaje("0.853", 1)).toBe("85.3%");
    expect(formatoPorcentaje(1)).toBe("100%");
    expect(formatoPorcentaje(null)).toBe("—");
  });

  it("tamaños de archivo", () => {
    expect(formatoBytes(500)).toBe("1 KB");
    expect(formatoBytes(840_000)).toBe("820 KB");
    expect(formatoBytes(4.2 * 1024 ** 2)).toBe("4.2 MB");
    expect(formatoBytes(15 * 1024 ** 3)).toBe("15.0 GB");
  });
});
