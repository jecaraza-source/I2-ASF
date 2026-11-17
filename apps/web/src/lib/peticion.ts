import "server-only";
import { headers } from "next/headers";

/** IP y navegador de la petición actual, para la bitácora de acceso. Nunca van a los logs. */
export async function datosAcceso(): Promise<{ ip: string | null; navegador: string | null }> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return { ip, navegador: h.get("user-agent") };
}

/** Origen público de la petición (para armar enlaces de regreso en correos). */
export async function origenPeticion(): Promise<string | null> {
  const h = await headers();
  const origen = h.get("origin");
  if (origen) return origen;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (!host) return null;
  return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
}
