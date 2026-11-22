/**
 * Familia de una línea de la red: agrupa los tipos de vínculo (texto libre de la fuente) y de
 * evento en pocas clases con significado, para darles color y leyenda en la vista.
 */
export const FAMILIAS_ARISTA = [
  "propiedad",
  "representacion",
  "fe_publica",
  "flujo",
  "irregularidad",
  "familiar",
  "cuenta",
  "contractual",
  "comunicacion",
  "otro",
] as const;
export type FamiliaArista = (typeof FAMILIAS_ARISTA)[number];

export const NOMBRE_FAMILIA: Record<FamiliaArista, string> = {
  propiedad: "Propiedad y control",
  representacion: "Representación y vigilancia",
  fe_publica: "Fe pública",
  flujo: "Flujo de recursos",
  irregularidad: "Posible irregularidad",
  familiar: "Familiar o personal",
  cuenta: "Cuentas y offshore",
  contractual: "Contratos y cargos",
  comunicacion: "Comunicación",
  otro: "Otra relación",
};

const EVENTO: Record<string, FamiliaArista> = {
  llamada: "comunicacion",
  transferencia: "flujo",
  pago: "flujo",
  contrato: "contractual",
};

/** El orden importa: gana el primer patrón que coincide. */
const PATRONES: [RegExp, FamiliaArista][] = [
  [/CORRUP|COMPLIC|CONFLICTO|TESTAFERRO|SIMULAD|FANTASMA|FACHADA|NOMINAL/, "irregularidad"],
  [/MATRIMON|FAMILIAR|CONYUGE|PARENTESCO|AMISTAD|HERMAN|PRIM[AO]\b/, "familiar"],
  [/OFFSHORE|CUENTA|CORRESPONSAL|FIDUCIAR/, "cuenta"],
  [/TRANSFER|WIRE|FLUJO|DEPOSITO|REPATRIA|PAGO|INVERSION/, "flujo"],
  [/PROPIED|CONTROL|ACCIONARI|SOCIO|BENEFICIARIO|ADMINISTRA|RED EMPRESARIAL/, "propiedad"],
  // Papeles de un acta o un poder (tarea 19).
  [/^(APODERADO|REPRESENTANTE_LEGAL|COMISARIO)$/, "representacion"],
  [/^NOTARIO$/, "fe_publica"],
  [
    /CONTRAT|CONTRACT|LICITA|ADJUDIC|REPRESENTA|FEDATARIO|CARGO|JERARQU|AUTORIZA|AUDITOR/,
    "contractual",
  ],
  [/COMUNICA|LLAMADA|TELEF/, "comunicacion"],
];

export function familiaArista(clase: "vinculo" | "evento", tipo: string): FamiliaArista {
  if (clase === "evento") return EVENTO[tipo] ?? "otro";
  const t = tipo.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();
  for (const [patron, familia] of PATRONES) if (patron.test(t)) return familia;
  return "otro";
}
