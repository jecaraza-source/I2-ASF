import { describe, expect, it } from "vitest";
import { FAMILIAS_ARISTA, NOMBRE_FAMILIA, familiaArista } from "./familia";

describe("familiaArista", () => {
  it("clasifica los tipos de vínculo del expediente de ejemplo", () => {
    const casos: [string, string][] = [
      ["PROPIEDAD", "propiedad"],
      ["CONTROL ACCIONARIO", "propiedad"],
      ["PROPIEDAD - BENEFICIARIO FINAL", "propiedad"],
      ["SOCIO COMERCIAL", "propiedad"],
      ["TRANSFERENCIA INT.", "flujo"],
      ["WIRE TRANSFER", "flujo"],
      ["DEPÓSITO", "flujo"],
      ["REPATRIACIÓN", "flujo"],
      ["CORRUPCIÓN / CONTRATOS", "irregularidad"],
      ["COMPLICIDAD - LICITACIÓN", "irregularidad"],
      ["CONFLICTO INTERÉS", "irregularidad"],
      ["TESTAFERRO", "irregularidad"],
      ["COMPRA-VENTA SIMULADA", "irregularidad"],
      ["ADMINISTRACIÓN NOMINAL", "irregularidad"],
      ["FAMILIAR - CÓNYUGE", "familiar"],
      ["CÓNYUGE", "familiar"],
      ["MATRIMONIO", "familiar"],
      ["PARENTESCO", "familiar"],
      ["CUENTA SUIZA", "cuenta"],
      ["CORRESPONSALÍA", "cuenta"],
      ["DEPÓSITO FIDUCIARIO", "cuenta"],
      ["RELACIÓN CONTRACTUAL", "contractual"],
      ["NEXO DIRECTO - ADJUDICACIÓN", "contractual"],
      ["FEDATARIO", "contractual"],
      ["CARGO PÚBLICO", "contractual"],
      ["COMUNICACIÓN", "comunicacion"],
      ["ALGO NUEVO", "otro"],
    ];
    for (const [tipo, esperado] of casos) {
      expect(familiaArista("vinculo", tipo), tipo).toBe(esperado);
    }
  });

  it("los eventos se clasifican por su tipo, no por texto", () => {
    expect(familiaArista("evento", "llamada")).toBe("comunicacion");
    expect(familiaArista("evento", "transferencia")).toBe("flujo");
    expect(familiaArista("evento", "contrato")).toBe("contractual");
    expect(familiaArista("evento", "otro")).toBe("otro");
  });

  it("toda familia tiene nombre", () => {
    for (const f of FAMILIAS_ARISTA) expect(NOMBRE_FAMILIA[f]).toBeTruthy();
  });
});
