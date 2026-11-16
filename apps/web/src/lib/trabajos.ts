import "server-only";
import { z } from "zod";
import { clienteServicio } from "@/lib/supabase/servicio";

type Servicio = NonNullable<ReturnType<typeof clienteServicio>>;

const payloadExtraccion = z.object({ registro_id: z.uuid(), documento_id: z.uuid() });

/**
 * Trabajo de extracción. En la tarea 07 solo deja el registro «en espera de extracción»; la IA
 * llega en la tarea 09. Idempotente: repetirlo no cambia nada.
 */
async function extraccion(servicio: Servicio, payload: unknown): Promise<void> {
  const p = payloadExtraccion.parse(payload);
  const { error } = await servicio
    .from("registro")
    .update({ estado_extraccion: "en_espera" })
    .eq("id", p.registro_id)
    .in("estado_extraccion", ["en_cola", "en_espera"]);
  if (error) throw new Error(`registro ${error.code ?? "?"}`);
}

const MANEJADORES: Record<string, (s: Servicio, payload: unknown) => Promise<void>> = {
  extraccion,
};

export type ResultadoTrabajos =
  | { configurado: false }
  | { configurado: true; tomados: number; hechos: number; reintentos: number; errores: number };

/**
 * Toma trabajos pendientes (bloqueo `for update skip locked` en la base) y los ejecuta.
 * Cada fallo se reintenta con espera creciente; al tercero queda en error.
 * En los logs solo van IDs y códigos (regla 7).
 */
export async function procesarTrabajos(
  opciones: { limite?: number; trabajoId?: string } = {},
): Promise<ResultadoTrabajos> {
  const servicio = clienteServicio();
  if (!servicio) return { configurado: false };
  const { data: trabajos, error } = await servicio.rpc("tomar_trabajos", {
    p_limite: opciones.limite ?? 10,
    ...(opciones.trabajoId ? { p_trabajo: opciones.trabajoId } : {}),
  });
  if (error) throw new Error(`tomar_trabajos ${error.code ?? "?"}`);

  const resultado = {
    configurado: true as const,
    tomados: 0,
    hechos: 0,
    reintentos: 0,
    errores: 0,
  };
  for (const t of trabajos ?? []) {
    resultado.tomados++;
    let ok = true;
    let motivo: string | null = null;
    try {
      const manejador = MANEJADORES[t.tipo];
      if (!manejador) throw new Error("tipo de trabajo desconocido");
      await manejador(servicio, t.payload);
    } catch (e) {
      ok = false;
      // Mensajes propios o códigos de la base: nunca contenido de documentos.
      motivo =
        e instanceof z.ZodError
          ? "payload inválido"
          : e instanceof Error
            ? e.message.slice(0, 120)
            : "error";
      console.error(`[trabajos] ${t.id} (${t.tipo}) falló en el intento ${t.intentos}`);
    }
    const { data: estado } = await servicio.rpc("terminar_trabajo", {
      p_trabajo: t.id,
      p_ok: ok,
      ...(motivo ? { p_error: motivo } : {}),
    });
    if (estado === "hecho") resultado.hechos++;
    else if (estado === "pendiente") resultado.reintentos++;
    else resultado.errores++;
  }
  return resultado;
}
