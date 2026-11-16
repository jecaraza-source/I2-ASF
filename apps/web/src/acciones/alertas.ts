"use server";

import { puede } from "@sigma/modelo";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { mensajeDeError } from "@/lib/errores-db";
import type { EstadoFormulario } from "@/lib/formulario";
import { ejecutarYGuardarReglas } from "@/lib/reglas-datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

const SIN_PERMISO: EstadoFormulario = { ok: false, mensaje: "Tu rol no permite esta acción." };

/** Ejecuta las reglas R01–R09 a demanda sobre el encargo. */
export async function ejecutarReglasAccion(
  _e: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "reglas.ejecutar")) return SIN_PERMISO;
  const id = z.uuid().safeParse(formData.get("encargo_id"));
  if (!id.success) return { ok: false, mensaje: "Encargo inválido." };
  const supabase = await clienteServidor();
  const { data: encargo } = await supabase
    .from("encargo")
    .select("id")
    .eq("id", id.data)
    .eq("organizacion_id", activa.organizacionId)
    .maybeSingle();
  if (!encargo) return { ok: false, mensaje: "El encargo no existe o no tienes acceso." };

  const r = await ejecutarYGuardarReglas(supabase, encargo.id);
  if (!r.ok) return { ok: false, mensaje: mensajeDeError({ code: r.codigo }, "ejecutarReglas") };
  revalidatePath(`/encargos/${encargo.id}/alertas`);
  return {
    ok: true,
    mensaje: `Reglas ejecutadas: ${r.nuevas} alerta(s) nueva(s), ${r.reproducidas} ya conocida(s)${r.no_vigentes ? `, ${r.no_vigentes} que ya no se reproduce(n)` : ""}.`,
  };
}

const resolucionSchema = z.object({
  encargo_id: z.uuid(),
  alerta_id: z.uuid(),
  estado: z.enum(["confirmada", "descartada"]),
  motivo: z.string().trim().min(3, "Escribe el motivo").max(1000),
});

/** Confirma o descarta una alerta con motivo. Una alerta confirmada no es un hallazgo. */
export async function resolverAlertaAccion(
  _e: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "alerta.resolver")) return SIN_PERMISO;
  const datos = resolucionSchema.safeParse({
    encargo_id: formData.get("encargo_id"),
    alerta_id: formData.get("alerta_id"),
    estado: formData.get("estado"),
    motivo: formData.get("motivo"),
  });
  if (!datos.success)
    return { ok: false, mensaje: datos.error.issues[0]?.message ?? "Datos inválidos." };
  const supabase = await clienteServidor();
  const { error } = await supabase.rpc("resolver_alerta", {
    p_alerta: datos.data.alerta_id,
    p_estado: datos.data.estado,
    p_motivo: datos.data.motivo,
  });
  if (error) {
    if (error.code === "22023") return { ok: false, mensaje: "La alerta ya estaba resuelta." };
    return { ok: false, mensaje: mensajeDeError(error, "resolverAlerta") };
  }
  revalidatePath(`/encargos/${datos.data.encargo_id}/alertas`);
  return {
    ok: true,
    mensaje: datos.data.estado === "confirmada" ? "Alerta confirmada." : "Alerta descartada.",
  };
}
