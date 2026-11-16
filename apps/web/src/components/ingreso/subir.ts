"use client";

import { prepararSubida } from "@/acciones/ingreso";
import { clienteNavegador } from "@/lib/supabase/navegador";

/** SHA-256 en el navegador (Web Crypto), en hexadecimal. */
export async function huellaDe(archivo: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await archivo.arrayBuffer());
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Sube el original directo al bucket con la URL firmada que emite el servidor. */
export async function subirOriginal(
  encargoId: string,
  archivo: File,
  sha256: string,
): Promise<{ ok: true } | { ok: false; mensaje: string }> {
  const subida = await prepararSubida({
    encargoId,
    sha256,
    nombre: archivo.name,
    tamano: archivo.size,
  });
  if (!subida.ok) return subida;
  if (!subida.token) return { ok: true };
  const { error } = await clienteNavegador()
    .storage.from("originales")
    .uploadToSignedUrl(subida.ruta, subida.token, archivo, { contentType: subida.mime });
  if (error && !/exist|duplicate/i.test(error.message)) {
    return { ok: false, mensaje: "No se pudo subir. Intenta de nuevo." };
  }
  return { ok: true };
}
