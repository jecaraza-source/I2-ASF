import type { RedExport } from "./tipos";

const comparar = (a: { id: string }, b: { id: string }) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** Ordena las llaves de los objetos para que el mismo contenido dé siempre el mismo texto. */
function ordenar(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(ordenar);
  if (valor && typeof valor === "object") {
    return Object.fromEntries(
      Object.keys(valor)
        .sort()
        .map((k) => [k, ordenar((valor as Record<string, unknown>)[k])]),
    );
  }
  return valor;
}

/**
 * Texto canónico de los datos exportados: listas ordenadas por ID y llaves ordenadas. Es lo que se
 * firma con SHA-256 en el reporte y lo que va adjunto al PDF, así cualquiera puede recalcular el hash.
 */
export function datosCanonicos(red: RedExport): string {
  return JSON.stringify(
    ordenar({
      ...red,
      entidades: [...red.entidades].sort(comparar),
      vinculos: [...red.vinculos].sort(comparar),
      eventos: [...red.eventos].sort(comparar),
      alertas: [...red.alertas].sort(comparar),
    }),
  );
}

/** SHA-256 en hexadecimal (Web Crypto: sirve en Node y en el navegador). */
export async function sha256Hex(datos: string | Uint8Array): Promise<string> {
  const bytes = typeof datos === "string" ? new TextEncoder().encode(datos) : datos;
  const copia = new Uint8Array(bytes.byteLength);
  copia.set(bytes);
  const hash = await crypto.subtle.digest("SHA-256", copia);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
