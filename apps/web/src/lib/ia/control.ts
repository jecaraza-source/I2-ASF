import "server-only";
import { MOTIVO_BLOQUEO_IA, type Json, type ProveedorIA } from "@sigma/modelo";
import { z } from "zod";
import type { clienteServicio } from "@/lib/supabase/servicio";

type Servicio = NonNullable<ReturnType<typeof clienteServicio>>;

const VARIABLE_LLAVE: Record<ProveedorIA, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
};
const VARIABLE_MODELO: Record<ProveedorIA, string> = {
  anthropic: "ANTHROPIC_MODEL",
  openai: "OPENAI_MODEL",
};

/** Estado de la configuración de un proveedor en el servidor. Nunca devuelve la llave. */
export function estadoProveedor(proveedor: ProveedorIA) {
  // Con la IA simulada (solo pruebas) no hacen falta llaves ni modelo: nada sale del servidor.
  const simulada = process.env.IA_SIMULADA === "1" && process.env.VERCEL_ENV !== "production";
  return {
    proveedor,
    llave: simulada || Boolean(process.env[VARIABLE_LLAVE[proveedor]]),
    variableLlave: VARIABLE_LLAVE[proveedor],
    modelo: process.env[VARIABLE_MODELO[proveedor]] || (simulada ? "simulado" : null),
    variableModelo: VARIABLE_MODELO[proveedor],
    /** Solo OpenAI: esfuerzo de razonamiento configurado, si lo hay. */
    esfuerzo:
      proveedor === "openai"
        ? process.env.OPENAI_REASONING_EFFORT?.trim().toLowerCase() || null
        : null,
  };
}

const permisoSchema = z.object({
  permitida: z.boolean(),
  motivo: z.string().nullable().optional(),
  organizacion_id: z.uuid().optional(),
});

export type PermisoIA =
  | { permitida: true; organizacionId: string; modelo: string }
  | { permitida: false; motivo: string; descripcion: string; organizacionId: string | null };

/**
 * Compuerta previa a CUALQUIER llamada a un proveedor de IA (regla 7): interruptor de la
 * organización, proveedor permitido en el encargo, topes diario y mensual, y llave presente.
 * Si algo falla al consultar, la respuesta es no.
 */
export async function iaPermitida(
  servicio: Servicio,
  encargoId: string,
  proveedor: ProveedorIA,
): Promise<PermisoIA> {
  const negar = (motivo: string, organizacionId: string | null = null): PermisoIA => ({
    permitida: false,
    motivo,
    descripcion: MOTIVO_BLOQUEO_IA[motivo] ?? "No permitida",
    organizacionId,
  });
  const { data, error } = await servicio.rpc("ia_permitida", {
    p_encargo: encargoId,
    p_proveedor: proveedor,
  });
  const r = permisoSchema.safeParse(data);
  if (error || !r.success) return negar("encargo_inexistente");
  const organizacionId = r.data.organizacion_id ?? null;
  if (!r.data.permitida || !organizacionId)
    return negar(r.data.motivo ?? "encargo_inexistente", organizacionId);
  const estado = estadoProveedor(proveedor);
  if (!estado.llave) return negar("sin_llave", organizacionId);
  if (!estado.modelo) return negar("sin_modelo", organizacionId);
  return { permitida: true, organizacionId, modelo: estado.modelo };
}

export type UsoIA = {
  organizacionId: string;
  encargoId: string | null;
  proveedor: ProveedorIA;
  modelo: string;
  /** Qué hizo la llamada: `extraccion`, `ocr`… (minúsculas, sin espacios). */
  funcion: string;
  tokensEntrada?: number;
  tokensSalida?: number;
  resultado: "ok" | "error" | "bloqueada";
  /** Código corto (estado HTTP, motivo de bloqueo). Nunca texto del documento ni del proveedor. */
  codigoError?: string | null;
  duracionMs?: number | null;
  trabajoId?: string | null;
  registroId?: string | null;
};

/** Deja constancia de una llamada (también de las bloqueadas y fallidas). Solo IDs y conteos. */
export async function registrarUsoIA(servicio: Servicio, uso: UsoIA): Promise<void> {
  const { error } = await servicio.rpc("registrar_uso_ia", {
    p: {
      organizacion_id: uso.organizacionId,
      encargo_id: uso.encargoId,
      proveedor: uso.proveedor,
      modelo: uso.modelo,
      funcion: uso.funcion,
      tokens_entrada: Math.max(0, Math.round(uso.tokensEntrada ?? 0)),
      tokens_salida: Math.max(0, Math.round(uso.tokensSalida ?? 0)),
      resultado: uso.resultado,
      codigo_error: uso.codigoError ?? null,
      duracion_ms: uso.duracionMs == null ? null : Math.max(0, Math.round(uso.duracionMs)),
      trabajo_id: uso.trabajoId ?? null,
      registro_id: uso.registroId ?? null,
    } as Json,
  });
  if (error) console.error(`[usoIA] no se pudo registrar: ${error.code ?? "desconocido"}`);
}
