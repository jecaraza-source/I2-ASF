"use server";

import { fila69bSchema } from "@sigma/importador/lista69b";
import { puede, type Json } from "@sigma/modelo";
import { refresh, revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { mensajeDeError } from "@/lib/errores-db";
import { ejecutarYGuardarReglas } from "@/lib/reglas-datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";
import { procesarTrabajos } from "@/lib/trabajos";

export type Resultado<T = undefined> =
  | ({ ok: true; mensaje?: string } & (T extends undefined ? object : { dato: T }))
  | { ok: false; mensaje: string };

const SIN_PERMISO = { ok: false as const, mensaje: "Tu rol no permite esta acción." };

/** Las consultas corren después de responder; el cron las recoge si algo falla. */
function procesarAhora(trabajoId: string) {
  after(async () => {
    try {
      await procesarTrabajos({ trabajoId });
    } catch {
      console.error(`[fuentes] el trabajo ${trabajoId} queda para el cron`);
    }
  });
}

/** Consulta las fuentes para una entidad (a demanda) o para todo el encargo (por lote). */
export async function consultarFuentes(encargoId: string, entidadId?: string): Promise<Resultado> {
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "fuente.consultar")) return SIN_PERMISO;
  const ids = z
    .object({ encargoId: z.uuid(), entidadId: z.uuid().optional() })
    .safeParse({ encargoId, entidadId });
  if (!ids.success) return { ok: false, mensaje: "Datos inválidos." };
  const supabase = await clienteServidor();
  const { data, error } = await supabase.rpc("encolar_consulta_fuentes", {
    p_encargo: ids.data.encargoId,
    ...(ids.data.entidadId ? { p_entidad: ids.data.entidadId } : {}),
  });
  if (error || typeof data !== "string") {
    return { ok: false, mensaje: mensajeDeError(error, "consultarFuentes") };
  }
  procesarAhora(data);
  return {
    ok: true,
    mensaje: entidadId
      ? "Consulta en curso. Los resultados aparecen aquí en unos segundos."
      : "Consulta en curso para todas las entidades del encargo. Puede tardar unos minutos.",
  };
}

const revisionSchema = z.object({
  resultadoId: z.uuid(),
  estado: z.enum(["confirmada", "descartada"]),
  motivo: z.string().trim().max(500).optional(),
});

/** Confirma o descarta un resultado. Lo encontrado no se edita; descartar exige motivo. */
export async function revisarResultado(entrada: unknown): Promise<Resultado> {
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "fuente.consultar")) return SIN_PERMISO;
  const p = revisionSchema.safeParse(entrada);
  if (!p.success) return { ok: false, mensaje: "Datos inválidos." };
  if (p.data.estado === "descartada" && (p.data.motivo?.length ?? 0) < 5) {
    return { ok: false, mensaje: "Explica por qué se descarta (al menos 5 caracteres)." };
  }
  const supabase = await clienteServidor();
  const { data, error } = await supabase
    .from("resultado_consulta")
    .update({ estado: p.data.estado, motivo: p.data.motivo ?? null })
    .eq("id", p.data.resultadoId)
    .eq("organizacion_id", activa.organizacionId)
    .select("encargo_id")
    .maybeSingle();
  if (error) {
    if (error.message.startsWith("ya_revisado")) {
      return { ok: false, mensaje: "Este resultado ya se revisó." };
    }
    return { ok: false, mensaje: mensajeDeError(error, "revisarResultado") };
  }
  if (!data) return SIN_PERMISO;
  // Confirmar una propuesta de la lista 69-B, o descartar una exacta, cambia R10.
  const reglas = await ejecutarYGuardarReglas(supabase, data.encargo_id);
  if (!reglas.ok) console.error(`[revisarResultado] reglas: ${reglas.codigo ?? "?"}`);
  revalidatePath(`/encargos/${data.encargo_id}`, "layout");
  refresh();
  return { ok: true };
}

/** Incorpora un resultado confirmado de una fuente externa como registro. */
export async function incorporarResultado(resultadoId: string): Promise<Resultado<string>> {
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "fuente.consultar")) return SIN_PERMISO;
  if (!z.uuid().safeParse(resultadoId).success) return { ok: false, mensaje: "Datos inválidos." };
  const supabase = await clienteServidor();
  const { data, error } = await supabase.rpc("incorporar_resultado_consulta", {
    p_resultado: resultadoId,
  });
  if (error || typeof data !== "string") {
    if (error?.message.startsWith("incorporacion")) {
      return {
        ok: false,
        mensaje: "Solo un resultado confirmado de una fuente externa se incorpora, una vez.",
      };
    }
    return { ok: false, mensaje: mensajeDeError(error, "incorporarResultado") };
  }
  refresh();
  return { ok: true, dato: data };
}

// ---------------------------------------------------------------------------
// Carga de la lista 69-B: el navegador lee el archivo y envía lotes; aquí se valida cada fila.
// ---------------------------------------------------------------------------
const inicioSchema = z.object({
  fuenteId: z.uuid(),
  nombreArchivo: z.string().trim().min(1).max(255),
  formato: z.enum(["csv", "xlsx"]),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  filasEsperadas: z.number().int().min(1).max(200_000),
});

export async function iniciarCargaLista(entrada: unknown): Promise<Resultado<string>> {
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "fuente.cargar")) return SIN_PERMISO;
  const p = inicioSchema.safeParse(entrada);
  if (!p.success) return { ok: false, mensaje: "Datos de la carga inválidos." };
  const supabase = await clienteServidor();
  const { data, error } = await supabase.rpc("iniciar_carga_fuente", {
    p: {
      fuente_id: p.data.fuenteId,
      nombre_archivo: p.data.nombreArchivo,
      formato: p.data.formato,
      sha256: p.data.sha256,
      filas_esperadas: p.data.filasEsperadas,
    },
  });
  if (error || typeof data !== "string") {
    return { ok: false, mensaje: mensajeDeError(error, "iniciarCargaLista") };
  }
  return { ok: true, dato: data };
}

// Un archivo «use server» solo exporta funciones: el tamaño de lote del cliente es el mismo número.
const MAX_LOTE_LISTA = 2000;
const loteSchema = z.object({
  cargaId: z.uuid(),
  filas: z.array(fila69bSchema).min(1).max(MAX_LOTE_LISTA),
});

export async function agregarLoteLista(entrada: unknown): Promise<Resultado<number>> {
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "fuente.cargar")) return SIN_PERMISO;
  const p = loteSchema.safeParse(entrada);
  if (!p.success)
    return { ok: false, mensaje: "Un lote trae filas inválidas; la carga se detuvo." };
  const supabase = await clienteServidor();
  const { data, error } = await supabase.rpc("agregar_lote_69b", {
    p_carga: p.data.cargaId,
    p_filas: p.data.filas as unknown as Json,
  });
  if (error || typeof data !== "number") {
    return { ok: false, mensaje: mensajeDeError(error, "agregarLoteLista") };
  }
  return { ok: true, dato: data };
}

export async function cerrarCargaLista(cargaId: string): Promise<Resultado<number>> {
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "fuente.cargar")) return SIN_PERMISO;
  if (!z.uuid().safeParse(cargaId).success) return { ok: false, mensaje: "Datos inválidos." };
  const supabase = await clienteServidor();
  const { data, error } = await supabase.rpc("cerrar_carga_fuente", { p_carga: cargaId });
  if (error || typeof data !== "number") {
    return { ok: false, mensaje: mensajeDeError(error, "cerrarCargaLista") };
  }
  revalidatePath("/encargos", "layout");
  refresh();
  return { ok: true, dato: data };
}
