"use server";

import { puede, VERSION_AVISO_CAMPO, type Json } from "@sigma/modelo";
import { refresh } from "next/cache";
import { z } from "zod";
import { mensajeDeError } from "@/lib/errores-db";
import { valoresDe, type EstadoFormulario } from "@/lib/formulario";
import { requerirOrganizacion, requerirSesion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

const SIN_PERMISO: EstadoFormulario = { ok: false, mensaje: "Tu rol no permite esta acción." };

const programaSchema = z.object({
  encargo_id: z.uuid(),
  verificador_id: z.uuid("Elige quién hará la visita."),
  entidades: z.array(z.uuid()).min(1, "Elige al menos un proveedor.").max(200),
  instrucciones: z
    .string()
    .trim()
    .max(1000, "Máximo 1,000 caracteres.")
    .transform((v) => (v === "" ? null : v)),
});

/** Asigna visitas de campo a los proveedores elegidos; la cédula sale prellenada. */
export async function programarVisitas(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { activa } = await requerirOrganizacion();
  const valores = valoresDe(formData);
  if (!puede(activa.rol, "campo.programar")) return { ...SIN_PERMISO, valores };
  const p = programaSchema.safeParse({
    ...valores,
    instrucciones: valores.instrucciones ?? "",
    entidades: formData.getAll("entidades").filter((v): v is string => typeof v === "string"),
  });
  if (!p.success) {
    const errores: Record<string, string[]> = {};
    for (const i of p.error.issues) {
      const campo = String(i.path[0] ?? "");
      errores[campo] = [...(errores[campo] ?? []), i.message];
    }
    return { ok: false, mensaje: "Revisa los campos marcados.", errores, valores };
  }
  const supabase = await clienteServidor();
  const { data, error } = await supabase.rpc("crear_visitas", { p: p.data as Json });
  if (error) {
    return {
      ok: false,
      mensaje:
        error.code === "23514"
          ? "Quien verifica debe ser auditor o verificador activo de la organización."
          : mensajeDeError(error, "programarVisitas"),
      valores,
    };
  }
  refresh();
  return {
    ok: true,
    mensaje:
      data === 0
        ? "Esos proveedores ya tenían una visita abierta."
        : `Se ${data === 1 ? "asignó 1 visita" : `asignaron ${data} visitas`}.`,
  };
}

const cancelarSchema = z.object({
  visita_id: z.uuid(),
  motivo: z.string().trim().min(5, "Escribe el motivo (al menos 5 caracteres).").max(500),
});

export async function cancelarVisita(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { activa } = await requerirOrganizacion();
  const valores = valoresDe(formData);
  if (!puede(activa.rol, "campo.programar")) return { ...SIN_PERMISO, valores };
  const p = cancelarSchema.safeParse(valores);
  if (!p.success) {
    return {
      ok: false,
      mensaje: "Revisa los campos marcados.",
      errores: { motivo: [p.error.issues[0]?.message ?? "Inválido"] },
      valores,
    };
  }
  const supabase = await clienteServidor();
  const { error } = await supabase.rpc("cancelar_visita", {
    p_visita: p.data.visita_id,
    p_motivo: p.data.motivo,
  });
  if (error) return { ok: false, mensaje: mensajeDeError(error, "cancelarVisita"), valores };
  refresh();
  return { ok: true, mensaje: "Visita cancelada." };
}

/** Aceptación del aviso de confidencialidad, una vez por organización y versión del texto. */
export async function aceptarAvisoCampo(organizacionId: string): Promise<{ ok: boolean }> {
  await requerirSesion();
  const id = z.uuid().safeParse(organizacionId);
  if (!id.success) return { ok: false };
  const supabase = await clienteServidor();
  const { error } = await supabase.rpc("aceptar_aviso_campo", {
    p_organizacion: id.data,
    p_version: VERSION_AVISO_CAMPO,
  });
  if (error) {
    mensajeDeError(error, "aceptarAvisoCampo");
    return { ok: false };
  }
  return { ok: true };
}
