import "server-only";
import type { Database } from "@sigma/modelo";
import { createClient } from "@supabase/supabase-js";

/**
 * Cliente con la service role key: se salta RLS. Úsalo ÚNICAMENTE desde el procesador de trabajos
 * (`lib/trabajos.ts`). Nunca en páginas, acciones de usuario ni código que llegue al navegador.
 * Devuelve null si la clave no está configurada.
 */
export function clienteServicio() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) return null;
  return createClient<Database>(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
