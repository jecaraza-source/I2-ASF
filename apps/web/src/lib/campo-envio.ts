"use client";

import { extensionDeMime } from "@sigma/modelo";
import { guardarPendiente, quitarPendiente, type PendienteLocal } from "@/lib/campo-local";
import { clienteNavegador } from "@/lib/supabase/navegador";

export type ResultadoEnvio = { ok: true } | { ok: false; error: string; sesion?: boolean };

async function enviarJson(ruta: string, cuerpo: unknown): Promise<ResultadoEnvio> {
  let r: Response;
  try {
    r = await fetch(ruta, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
      credentials: "same-origin",
    });
  } catch {
    return { ok: false, error: "Sin conexión." };
  }
  if (r.ok) return { ok: true };
  if (r.status === 401) return { ok: false, error: "Tu sesión terminó.", sesion: true };
  const datos: unknown = await r.json().catch(() => null);
  const error =
    datos && typeof datos === "object" && "error" in datos && typeof datos.error === "string"
      ? datos.error
      : `El servidor respondió ${r.status}.`;
  return { ok: false, error };
}

/**
 * Envía una cédula pendiente: sube cada foto al bucket directo desde el teléfono (sin pasar por el
 * límite de 4.5 MB de las funciones), el servidor verifica su huella y la registra, y al final se
 * manda la cédula. Cada paso puede repetirse sin duplicar nada; lo enviado queda marcado en el
 * teléfono para no volver a subirlo.
 */
export async function enviarPendiente(p: PendienteLocal): Promise<ResultadoEnvio> {
  const supabase = clienteNavegador();
  for (const foto of p.fotos) {
    if (foto.registrada) continue;
    const ruta = `${p.organizacion_id}/${p.encargo_id}/${p.cedula.visita_id}/${foto.id}.${extensionDeMime(foto.mime)}`;
    const { error: errorSubida } = await supabase.storage
      .from("campo")
      .upload(ruta, foto.blob, { contentType: foto.mime, upsert: false });
    // Ya subida en un intento anterior: el servidor comprueba que sea la misma foto.
    const yaExiste =
      errorSubida &&
      ("statusCode" in errorSubida
        ? String(errorSubida.statusCode) === "409"
        : /exists|duplicate/i.test(errorSubida.message));
    if (errorSubida && !yaExiste) {
      return { ok: false, error: "No se pudo subir una foto." };
    }
    const r = await enviarJson("/api/campo/evidencia", {
      id: foto.id,
      visita_id: p.cedula.visita_id,
      ruta,
      sha256: foto.sha256,
      bytes: foto.bytes,
      mime: foto.mime,
      capturada_en: foto.capturada_en,
      latitud: foto.latitud,
      longitud: foto.longitud,
      precision_m: foto.precision_m,
    });
    if (!r.ok) return r;
    foto.registrada = true;
    await guardarPendiente(p);
  }
  const r = await enviarJson("/api/campo/cedula", {
    ...p.cedula,
    evidencias: p.fotos.map((f) => f.id),
  });
  if (!r.ok) return r;
  await quitarPendiente(p.cedula.id);
  return { ok: true };
}
