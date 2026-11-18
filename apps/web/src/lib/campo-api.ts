import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { obtenerSesion } from "@/lib/sesion";

/**
 * Frontera de las rutas de la app de campo: sesión válida, mismo origen y JSON. Responde con un
 * error listo para devolver, o con el cuerpo ya leído (sin validar: lo valida zod en cada ruta).
 */
export async function entradaCampo(
  request: NextRequest,
): Promise<{ error: NextResponse } | { cuerpo: unknown }> {
  const sesion = await obtenerSesion();
  if (!sesion) return { error: NextResponse.json({ error: "Sin sesión" }, { status: 401 }) };
  const origen = request.headers.get("origin");
  if (origen && origen !== request.nextUrl.origin) {
    return { error: NextResponse.json({ error: "Origen no permitido" }, { status: 403 }) };
  }
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return { error: NextResponse.json({ error: "Se espera JSON" }, { status: 415 }) };
  }
  try {
    return { cuerpo: await request.json() };
  } catch {
    return { error: NextResponse.json({ error: "JSON inválido" }, { status: 400 }) };
  }
}

export const SIN_CACHE = { "Cache-Control": "no-store" } as const;
