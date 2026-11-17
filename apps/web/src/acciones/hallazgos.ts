"use server";

import { puede, type Json } from "@sigma/modelo";
import { refresh, revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { mensajeDeError } from "@/lib/errores-db";
import { valoresDe, type EstadoFormulario } from "@/lib/formulario";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

const SIN_PERMISO: EstadoFormulario = { ok: false, mensaje: "Tu rol no permite esta acción." };

const hallazgoSchema = z.object({
  encargo_id: z.uuid(),
  redaccion: z
    .string()
    .trim()
    .min(20, "Redacta el hallazgo (al menos 20 caracteres).")
    .max(10000, "Máximo 10,000 caracteres."),
  sintesis_id: z
    .uuid()
    .optional()
    .or(z.literal("").transform(() => undefined)),
});

/** Hallazgo que redacta el auditor; si viene de una síntesis aprobada, queda adjunta. */
export async function crearHallazgo(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { activa } = await requerirOrganizacion();
  const valores = valoresDe(formData);
  if (!puede(activa.rol, "hallazgo.editar")) return { ...SIN_PERMISO, valores };
  const p = hallazgoSchema.safeParse(valores);
  if (!p.success) {
    const error = p.error.issues.find((i) => i.path[0] === "redaccion");
    return {
      ok: false,
      mensaje: "Revisa los campos marcados.",
      errores: error ? { redaccion: [error.message] } : undefined,
      valores,
    };
  }
  const supabase = await clienteServidor();
  const { data, error } = await supabase.rpc("crear_hallazgo", { p: p.data as Json });
  if (error || typeof data !== "string") {
    return { ok: false, mensaje: mensajeDeError(error, "crearHallazgo"), valores };
  }
  redirect(`/encargos/${p.data.encargo_id}/hallazgos/${data}`);
}

const redaccionSchema = z.object({
  encargo_id: z.uuid(),
  id: z.uuid(),
  redaccion: hallazgoSchema.shape.redaccion,
});

export async function guardarRedaccion(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { activa } = await requerirOrganizacion();
  const valores = valoresDe(formData);
  if (!puede(activa.rol, "hallazgo.editar")) return { ...SIN_PERMISO, valores };
  const p = redaccionSchema.safeParse(valores);
  if (!p.success) {
    return {
      ok: false,
      mensaje: "Revisa los campos marcados.",
      errores: { redaccion: [p.error.issues[0]?.message ?? "Inválido"] },
      valores,
    };
  }
  const supabase = await clienteServidor();
  const { error, data } = await supabase
    .from("hallazgo")
    .update({ redaccion: p.data.redaccion })
    .eq("id", p.data.id)
    .eq("encargo_id", p.data.encargo_id)
    .select("id")
    .maybeSingle();
  if (error || !data) {
    return {
      ok: false,
      mensaje:
        error?.code === "23514"
          ? "El hallazgo ya está firmado: no cambia."
          : mensajeDeError(error, "guardarRedaccion"),
      valores,
    };
  }
  revalidatePath(`/encargos/${p.data.encargo_id}/hallazgos`);
  return { ok: true, mensaje: "Redacción guardada.", valores };
}

const idsSchema = z.object({ encargoId: z.uuid(), hallazgoId: z.uuid() });

export async function firmarHallazgo(entrada: unknown): Promise<{ ok: boolean; mensaje: string }> {
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "hallazgo.editar"))
    return { ok: false, mensaje: "Tu rol no permite esta acción." };
  const p = idsSchema.safeParse(entrada);
  if (!p.success) return { ok: false, mensaje: "Datos inválidos." };
  const supabase = await clienteServidor();
  const { error, data } = await supabase
    .from("hallazgo")
    .update({ firmado_en: new Date().toISOString() })
    .eq("id", p.data.hallazgoId)
    .eq("encargo_id", p.data.encargoId)
    .select("id")
    .maybeSingle();
  if (error || !data) return { ok: false, mensaje: mensajeDeError(error, "firmarHallazgo") };
  revalidatePath(`/encargos/${p.data.encargoId}/hallazgos`);
  refresh();
  return { ok: true, mensaje: "Hallazgo firmado." };
}

const adjuntarSchema = z.object({
  encargo_id: z.uuid(),
  hallazgo_id: z.uuid(),
  sintesis_id: z.uuid(),
});

/** Adjunta una síntesis aprobada a un hallazgo sin firmar. */
export async function adjuntarSintesis(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { activa } = await requerirOrganizacion();
  const valores = valoresDe(formData);
  if (!puede(activa.rol, "hallazgo.editar")) return { ...SIN_PERMISO, valores };
  const p = adjuntarSchema.safeParse(valores);
  if (!p.success) return { ok: false, mensaje: "Elige un hallazgo.", valores };
  const supabase = await clienteServidor();
  const { data: encargo } = await supabase
    .from("encargo")
    .select("organizacion_id")
    .eq("id", p.data.encargo_id)
    .maybeSingle();
  if (!encargo) return { ok: false, mensaje: "Encargo inexistente.", valores };
  const { error } = await supabase.from("hallazgo_sintesis").insert({
    organizacion_id: encargo.organizacion_id,
    encargo_id: p.data.encargo_id,
    hallazgo_id: p.data.hallazgo_id,
    sintesis_id: p.data.sintesis_id,
  });
  if (error) {
    return {
      ok: false,
      mensaje:
        error.code === "23505"
          ? "Esa síntesis ya está adjunta a ese hallazgo."
          : error.code === "23514"
            ? "Solo se adjunta a un hallazgo sin firmar."
            : mensajeDeError(error, "adjuntarSintesis"),
      valores,
    };
  }
  revalidatePath(`/encargos/${p.data.encargo_id}/analizador/${p.data.sintesis_id}`);
  return { ok: true, mensaje: "Síntesis adjunta al hallazgo." };
}
