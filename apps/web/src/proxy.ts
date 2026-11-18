import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// /api/trabajos se protege con CRON_SECRET en el propio route handler (lo llama el cron, sin sesión).
// `/acceso` recibe el enlace de invitación: la sesión se crea ahí mismo, en el navegador.
const PUBLICAS = ["/ingresar", "/api/trabajos", "/acceso"];

/**
 * Refresca la sesión de Supabase en cada navegación y manda a /ingresar a quien
 * no la tenga. Es una verificación optimista: cada página y acción vuelve a
 * validar la sesión en el servidor y RLS protege los datos.
 */
export async function proxy(request: NextRequest) {
  let respuesta = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !clave) return respuesta;

  const supabase = createServerClient(url, clave, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(porEscribir, encabezados) {
        for (const { name, value } of porEscribir) request.cookies.set(name, value);
        respuesta = NextResponse.next({ request });
        for (const { name, value, options } of porEscribir) {
          respuesta.cookies.set(name, value, options);
        }
        for (const [clave, valor] of Object.entries(encabezados ?? {})) {
          respuesta.headers.set(clave, valor);
        }
      },
    },
  });

  const { data } = await supabase.auth.getClaims();
  const ruta = request.nextUrl.pathname;
  const esPublica = PUBLICAS.some((p) => ruta === p || ruta.startsWith(`${p}/`));

  if (!data?.claims && !esPublica) {
    const destino = request.nextUrl.clone();
    destino.pathname = "/ingresar";
    destino.search = "";
    if (ruta !== "/") destino.searchParams.set("siguiente", ruta);
    return NextResponse.redirect(destino);
  }
  return respuesta;
}

export const config = {
  // Todo menos archivos estáticos y la marca.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|marca/|sw\\.js|campo\\.webmanifest).*)"],
};
