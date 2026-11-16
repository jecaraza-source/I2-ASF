/**
 * Lectura de .xlsx (solo servidor). Librería: read-excel-file
 * - mantenida activamente, sin dependencias nativas y con tipos;
 * - entrega valores tipados (número, fecha, texto) y conserva la numeración de filas;
 * - el paquete `xlsx` de npm quedó congelado en 0.18.5 con vulnerabilidades conocidas.
 * Es el único archivo que depende de la librería: el resto del paquete trabaja
 * sobre `Libro`, así que cambiar de lector no toca la lógica.
 */
import readExcelFile from "read-excel-file/node";
import type { Libro } from "./importar";
import type { Celda } from "./normalizacion";

/** Límite de filas por hoja: protege al servidor de archivos desproporcionados. */
export const MAX_FILAS_POR_HOJA = 50_000;

export async function leerXlsx(contenido: Buffer | Uint8Array): Promise<Libro> {
  const buffer = Buffer.isBuffer(contenido) ? contenido : Buffer.from(contenido);
  const hojas = await readExcelFile(buffer);
  return {
    hojas: hojas.map((h) => {
      if (h.data.length > MAX_FILAS_POR_HOJA) {
        throw new Error(`La hoja «${h.sheet}» excede ${MAX_FILAS_POR_HOJA} filas`);
      }
      return {
        nombre: h.sheet,
        filas: h.data.map((fila) =>
          fila.map((c): Celda => (c === undefined ? null : (c as Celda))),
        ),
      };
    }),
  };
}
