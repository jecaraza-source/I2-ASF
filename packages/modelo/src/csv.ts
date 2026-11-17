/**
 * CSV para exportaciones. Los datos vienen de archivos del auditado (regla 6): una celda que empieza
 * con `=`, `+`, `-`, `@`, tabulador o retorno de carro se antepone con un apóstrofo para que Excel
 * la muestre como texto y no la ejecute como fórmula.
 */
const PELIGROSO = /^[=+\-@\t\r]/;

export function celdaCsv(valor: unknown): string {
  if (valor === null || valor === undefined) return "";
  let texto = typeof valor === "string" ? valor : String(valor);
  // Los números propios (montos que arma la plataforma) no se tocan; solo el texto.
  if (typeof valor === "string" && PELIGROSO.test(texto)) texto = `'${texto}`;
  return /[",\n\r;]/.test(texto) || texto !== texto.trim()
    ? `"${texto.replace(/"/g, '""')}"`
    : texto;
}

/** Filas a CSV con BOM para que Excel reconozca UTF-8 (acentos y ñ). */
export function aCsv(
  encabezados: readonly string[],
  filas: readonly (readonly unknown[])[],
): string {
  const lineas = [encabezados, ...filas].map((f) => f.map(celdaCsv).join(","));
  return `\uFEFF${lineas.join("\r\n")}\r\n`;
}
