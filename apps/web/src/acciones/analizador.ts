"use server";

import { acotarAfirmaciones } from "@sigma/importador/sintesis";
import { puede, type Json } from "@sigma/modelo";
import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { z } from "zod";
import { mensajeDeError } from "@/lib/errores-db";
import { valoresDe, type EstadoFormulario } from "@/lib/formulario";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";
import { procesarTrabajos } from "@/lib/trabajos";

export type Resultado = { ok: true; mensaje?: string } | { ok: false; mensaje: string };

const SIN_PERMISO = { ok: false as const, mensaje: "Tu rol no permite esta acción." };

/** La síntesis se genera después de responder; el cron la recoge si algo falla. */
function generarAhora() {
  after(async () => {
    try {
      await procesarTrabajos({ limite: 3 });
    } catch {
      console.error("[analizador] la generación queda para el cron");
    }
  });
}

const nuevaSchema = z.object({
  encargo_id: z.uuid(),
  alcance_tipo: z.enum(["expediente", "entidad"]),
  alcance_id: z.uuid(),
  registros: z.array(z.uuid()).min(1, "Elige al menos un registro.").max(300),
});

/** Crea la síntesis con los registros elegidos y encola su generación. */
export async function crearSintesis(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { activa } = await requerirOrganizacion();
  const valores = valoresDe(formData);
  if (!puede(activa.rol, "sintesis.generar")) return { ...SIN_PERMISO, valores };
  const p = nuevaSchema.safeParse({
    ...valores,
    registros: formData.getAll("registros").filter((v): v is string => typeof v === "string"),
  });
  if (!p.success) {
    return {
      ok: false,
      mensaje: p.error.issues[0]?.message.startsWith("Elige")
        ? "Elige al menos un registro."
        : "Datos inválidos.",
      valores,
    };
  }
  const supabase = await clienteServidor();
  const { data, error } = await supabase.rpc("crear_sintesis", { p: p.data as Json });
  if (error || typeof data !== "string") {
    return {
      ok: false,
      mensaje:
        error?.code === "23514"
          ? "Solo pueden entrar registros validados de este alcance. Recarga la página."
          : mensajeDeError(error, "crearSintesis"),
      valores,
    };
  }
  generarAhora();
  redirect(`/encargos/${p.data.encargo_id}/analizador/${data}`);
}

const afirmacionSchema = z.object({
  texto: z.string().trim().min(1).max(2000),
  registros: z.array(z.uuid()).min(1).max(50),
});
const guardarSchema = z.object({
  encargoId: z.uuid(),
  sintesisId: z.uuid(),
  afirmaciones: z.array(z.unknown()).max(200),
  registros: z.array(z.uuid()).min(1).max(300),
  aprobar: z.boolean(),
});

/**
 * Guarda el borrador (y, si se pide, lo aprueba). El servidor vuelve a acotar las citas al alcance:
 * una afirmación sin registro no se guarda. La base verifica cada cita otra vez.
 */
export async function guardarSintesis(entrada: unknown): Promise<Resultado> {
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "sintesis.generar")) return SIN_PERMISO;
  const p = guardarSchema.safeParse(entrada);
  if (!p.success) return { ok: false, mensaje: "Datos inválidos." };
  const validas = p.data.afirmaciones.flatMap((a) => {
    const r = afirmacionSchema.safeParse(a);
    return r.success ? [r.data] : [];
  });
  const afirmaciones = acotarAfirmaciones(validas, p.data.registros);
  if (p.data.aprobar && afirmaciones.length === 0) {
    return { ok: false, mensaje: "Una síntesis sin afirmaciones con registro no se aprueba." };
  }
  const supabase = await clienteServidor();
  const { error } = await supabase.rpc("guardar_borrador_sintesis", {
    p_sintesis: p.data.sintesisId,
    p_afirmaciones: afirmaciones as Json,
    p_registros: p.data.registros,
    p_aprobar: p.data.aprobar,
  });
  if (error) {
    return {
      ok: false,
      mensaje:
        error.code === "23514"
          ? "La síntesis cambió o cita registros que ya no están en el alcance. Recarga la página."
          : mensajeDeError(error, "guardarSintesis"),
    };
  }
  revalidatePath(`/encargos/${p.data.encargoId}/analizador`);
  refresh();
  return {
    ok: true,
    mensaje: p.data.aprobar ? "Síntesis aprobada." : "Borrador guardado.",
  };
}

const idsSchema = z.object({ encargoId: z.uuid(), sintesisId: z.uuid() });

export async function descartarSintesis(entrada: unknown): Promise<Resultado> {
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "sintesis.generar")) return SIN_PERMISO;
  const p = idsSchema.extend({ motivo: z.string().trim().max(500) }).safeParse(entrada);
  if (!p.success) return { ok: false, mensaje: "Datos inválidos." };
  if (p.data.motivo.length < 5) {
    return { ok: false, mensaje: "Explica por qué se descarta (al menos 5 caracteres)." };
  }
  const supabase = await clienteServidor();
  const { error } = await supabase.rpc("descartar_sintesis", {
    p_sintesis: p.data.sintesisId,
    p_motivo: p.data.motivo,
  });
  if (error) return { ok: false, mensaje: mensajeDeError(error, "descartarSintesis") };
  revalidatePath(`/encargos/${p.data.encargoId}/analizador`);
  refresh();
  return { ok: true, mensaje: "Síntesis descartada." };
}

export async function reintentarSintesis(entrada: unknown): Promise<Resultado> {
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "sintesis.generar")) return SIN_PERMISO;
  const p = idsSchema.safeParse(entrada);
  if (!p.success) return { ok: false, mensaje: "Datos inválidos." };
  const supabase = await clienteServidor();
  const { error } = await supabase.rpc("reintentar_sintesis", { p_sintesis: p.data.sintesisId });
  if (error) return { ok: false, mensaje: mensajeDeError(error, "reintentarSintesis") };
  generarAhora();
  refresh();
  return { ok: true, mensaje: "Generando de nuevo…" };
}
