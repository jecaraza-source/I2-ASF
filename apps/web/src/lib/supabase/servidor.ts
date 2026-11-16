import "server-only";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@sigma/modelo";
import { cookies } from "next/headers";
import { entornoSupabase } from "@/lib/entorno";

/**
 * Cliente de Supabase con la sesión del usuario (clave pública + cookies).
 * Todo lo que lee o escribe pasa por RLS. La service role key nunca se usa aquí.
 */
export async function clienteServidor() {
  const almacen = await cookies();
  const { url, clave } = entornoSupabase();
  return createServerClient<Database>(url, clave, {
    cookies: {
      getAll() {
        return almacen.getAll();
      },
      setAll(porEscribir) {
        try {
          for (const { name, value, options } of porEscribir) {
            almacen.set(name, value, options);
          }
        } catch {
          // En Server Components no se pueden escribir cookies; el proxy refresca la sesión.
        }
      },
    },
  });
}
