/**
 * Lectura de archivos en el navegador (lista 69-B): CSV o Excel a tabla de celdas. El servidor
 * vuelve a validar cada fila antes de guardarla.
 */
import readExcelFile from "read-excel-file/browser";
import { decodificarTexto, tablaDeCsv } from "./lista69b";
import type { Celda } from "./normalizacion";

export type FormatoTabla = "csv" | "xlsx";

export function formatoDe(nombre: string): FormatoTabla | null {
  const n = nombre.toLowerCase();
  if (n.endsWith(".csv") || n.endsWith(".txt")) return "csv";
  if (n.endsWith(".xlsx")) return "xlsx";
  return null;
}

/** SHA-256 en hexadecimal (huella de la carga). */
export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Tablas del archivo. Un CSV da una tabla; un Excel, una por hoja (quien llama elige la que tenga
 * el encabezado).
 */
export async function leerTablas(bytes: ArrayBuffer, formato: FormatoTabla): Promise<Celda[][][]> {
  if (formato === "csv") return [tablaDeCsv(decodificarTexto(new Uint8Array(bytes)))];
  const hojas = await readExcelFile(new Blob([bytes]));
  return hojas.map((h) =>
    h.data.map((fila) => fila.map((c) => (c === undefined ? null : (c as Celda)))),
  );
}
