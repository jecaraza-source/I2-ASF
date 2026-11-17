import "server-only";
import { z } from "zod";
import { generarSintesis, sintesisFallida } from "@/lib/analizador/generar";
import { consultarFuentes } from "@/lib/fuentes/consultar";
import { extraerDocumento } from "@/lib/ia/extraer";
import { clienteServicio } from "@/lib/supabase/servicio";

type Servicio = NonNullable<ReturnType<typeof clienteServicio>>;

type Trabajo = { id: string; tipo: string; payload: unknown; intentos: number };

const MANEJADORES: Record<string, (s: Servicio, trabajo: Trabajo) => Promise<void>> = {
  extraccion: extraerDocumento,
  consulta_fuentes: consultarFuentes,
  sintesis: generarSintesis,
};

/** Qué hacer cuando un trabajo agota sus intentos (además de marcarlo en error). */
const AL_FALLAR: Record<string, (s: Servicio, payload: unknown) => Promise<void>> = {
  sintesis: sintesisFallida,
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
      await manejador(servicio, t);
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
    else {
      resultado.errores++;
      try {
        await AL_FALLAR[t.tipo]?.(servicio, t.payload);
      } catch {
        console.error(`[trabajos] ${t.id} (${t.tipo}) no pudo cerrar su error`);
      }
    }
  }
  return resultado;
}
