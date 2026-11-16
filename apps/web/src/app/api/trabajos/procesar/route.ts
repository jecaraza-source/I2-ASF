import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { procesarTrabajos } from "@/lib/trabajos";

export const maxDuration = 60;

/** Compara en tiempo constante (sobre hashes, para no filtrar el largo del secreto). */
function autorizado(request: NextRequest): boolean {
  const secreto = process.env.CRON_SECRET;
  if (!secreto) return false;
  const digest = (v: string) => createHash("sha256").update(v).digest();
  return timingSafeEqual(
    digest(request.headers.get("authorization") ?? ""),
    digest(`Bearer ${secreto}`),
  );
}

/**
 * Procesador de trabajos. Lo llama el cron de Vercel (GET con `Authorization: Bearer CRON_SECRET`).
 * Idempotente: los trabajos se toman con bloqueo en la base y cada manejador puede repetirse.
 */
async function procesar(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "CRON_SECRET no está configurado" }, { status: 503 });
  }
  if (!autorizado(request)) return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  try {
    const r = await procesarTrabajos({ limite: 25 });
    if (!r.configurado) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY no está configurada" },
        { status: 503 },
      );
    }
    return NextResponse.json(r);
  } catch (e) {
    console.error(`[trabajos] ${e instanceof Error ? e.message : "error"}`);
    return NextResponse.json({ error: "No se pudieron procesar los trabajos" }, { status: 500 });
  }
}

export const GET = procesar;
export const POST = procesar;
