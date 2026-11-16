"use client";

import { createBrowserClient } from "@supabase/ssr";

/**
 * Cliente de navegador con la clave pública. Solo se usa para subir originales al bucket con una
 * URL firmada que emite el servidor; las tablas se leen y escriben siempre desde el servidor.
 */
export function clienteNavegador() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !clave) throw new Error("Falta la configuración pública de Supabase.");
  return createBrowserClient(url, clave);
}
