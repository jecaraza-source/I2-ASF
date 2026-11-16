import type { DatosReglas, ExtraccionRegla, RegistroRegla } from "./tipos";

export function sinAcentos(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Mayúsculas, sin acentos, guiones bajos como espacios. */
export function plano(s: string | null | undefined): string {
  return sinAcentos(String(s ?? ""))
    .toUpperCase()
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const NUMERO = /^-?\d+(\.\d+)?$/;

/** Centavos exactos de un valor numérico («1234.50», 1234.5); null si no es número. */
export function centavos(v: unknown): bigint | null {
  const s =
    typeof v === "number" && Number.isFinite(v)
      ? v.toFixed(2)
      : typeof v === "string"
        ? v.trim()
        : "";
  if (!NUMERO.test(s)) return null;
  const negativo = s.startsWith("-");
  const [entero = "0", decimal = ""] = s.replace("-", "").split(".");
  const c = BigInt(entero) * 100n + BigInt((decimal + "00").slice(0, 2));
  return negativo ? -c : c;
}

/** «$1,948,320,450.00» */
export function pesos(c: bigint): string {
  const abs = c < 0n ? -c : c;
  const entero = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${c < 0n ? "-" : ""}$${entero}.${(abs % 100n).toString().padStart(2, "0")}`;
}

export function entero(c: bigint): string {
  return (c / 100n).toString();
}

export type Cifra = {
  extraccion: ExtraccionRegla;
  registro: RegistroRegla;
  concepto: string;
  valor: bigint;
  es_monto: boolean;
};

/** Cifras declaradas (totales, portada, resumen): extracciones `total_declarado`. */
export function cifrasDe(datos: DatosReglas): Cifra[] {
  const cifras: Cifra[] = [];
  for (const registro of datos.registros)
    for (const extraccion of registro.extracciones) {
      if (extraccion.campo !== "total_declarado") continue;
      const v = extraccion.valor_normalizado;
      if (!v || typeof v !== "object") continue;
      const { concepto, valor, es_monto } = v as Record<string, unknown>;
      const c = centavos(valor);
      if (typeof concepto !== "string" || c === null) continue;
      cifras.push({ extraccion, registro, concepto, valor: c, es_monto: es_monto === true });
    }
  return cifras;
}

export function textoDe(registro: RegistroRegla | undefined): string {
  return plano((registro?.extracciones ?? []).map((x) => x.valor_crudo ?? "").join(" | "));
}

export function indice<T extends { id: string }>(lista: T[]): Map<string, T> {
  return new Map(lista.map((x) => [x.id, x]));
}

export function ordenados(ids: Iterable<string>): string[] {
  return [...new Set(ids)].sort();
}
