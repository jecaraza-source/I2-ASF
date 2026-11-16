import "server-only";

/** Variables públicas de Supabase; fallan pronto y con un mensaje claro si faltan. */
export function entornoSupabase(): { url: string; clave: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !clave) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY (ver docs/SETUP.md §4).",
    );
  }
  return { url, clave };
}
