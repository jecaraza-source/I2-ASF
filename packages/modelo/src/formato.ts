/**
 * Formato de números para mostrar (es-MX): miles con coma, decimales con punto, montos con su moneda
 * y proporciones como porcentaje. Solo para la pantalla y los PDF: los CSV y la base guardan el
 * valor sin formato.
 */

const ENTERO = new Intl.NumberFormat("es-MX", { maximumFractionDigits: 0 });

function numeroDe(v: number | string | bigint | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** «1,234,567» o con decimales fijos: «1,234.50». Lo que no es número se devuelve tal cual. */
export function formatoNumero(
  v: number | string | bigint | null | undefined,
  decimales?: number,
): string {
  const n = numeroDe(v);
  if (n === null) return v === null || v === undefined ? "—" : String(v);
  if (decimales === undefined) {
    return Number.isInteger(n)
      ? ENTERO.format(n)
      : new Intl.NumberFormat("es-MX", { maximumFractionDigits: 2 }).format(n);
  }
  return new Intl.NumberFormat("es-MX", {
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(n);
}

/** Agrupa con comas la parte entera de un decimal en texto, sin pasar por `number` (sin redondeo). */
function agruparTexto(s: string): string | null {
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(s.trim());
  if (!m) return null;
  const entero = (m[2] ?? "0").replace(/^0+(?=\d)/, "").replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const decimal = ((m[3] ?? "") + "00").slice(0, Math.max(2, (m[3] ?? "").length));
  return `${m[1] ?? ""}${entero}.${decimal}`;
}

/**
 * Monto con su moneda, conservando el signo: «$1,948,320,450.00» (MXN) o «US$12,500.00»; otras
 * monedas, «€1,200.00» o «1,200.00 CHF». Acepta el `numeric` de la base como texto, sin perder
 * precisión.
 */
export function formatoMonto(
  v: number | string | null | undefined,
  moneda: string | null = "MXN",
): string {
  if (v === null || v === undefined || v === "") return "—";
  const codigo = moneda && /^[A-Z]{3}$/.test(moneda) ? moneda : "MXN";
  const texto = typeof v === "number" ? (Number.isFinite(v) ? v.toFixed(2) : null) : v;
  const agrupado = texto === null ? null : agruparTexto(texto);
  if (agrupado === null) return `${String(v)}${moneda ? ` ${moneda}` : ""}`;
  const negativo = agrupado.startsWith("-");
  const abs = negativo ? agrupado.slice(1) : agrupado;
  const simbolo = codigo === "MXN" ? "$" : codigo === "USD" ? "US$" : codigo === "EUR" ? "€" : null;
  const cuerpo = simbolo ? `${simbolo}${abs}` : `${abs} ${codigo}`;
  return `${negativo ? "-" : ""}${cuerpo}`;
}

/** Proporción (0 a 1) como porcentaje: 0.853 → «85%»; con decimales: «85.3%». */
export function formatoPorcentaje(v: number | string | null | undefined, decimales = 0): string {
  const n = numeroDe(v);
  if (n === null) return "—";
  return new Intl.NumberFormat("es-MX", {
    style: "percent",
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(n);
}

/** Tamaño de archivo: «820 KB», «4.2 MB», «1.1 GB». */
export function formatoBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes >= 1024 ** 3) return `${formatoNumero(bytes / 1024 ** 3, 1)} GB`;
  if (bytes >= 1024 ** 2) return `${formatoNumero(bytes / 1024 ** 2, 1)} MB`;
  return `${formatoNumero(Math.max(1, Math.round(bytes / 1024)))} KB`;
}
