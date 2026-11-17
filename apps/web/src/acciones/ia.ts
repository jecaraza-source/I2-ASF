"use server";

import { PROVEEDORES_IA, puede } from "@sigma/modelo";
import { refresh, revalidatePath } from "next/cache";
import { z } from "zod";
import { mensajeDeError } from "@/lib/errores-db";
import type { EstadoFormulario } from "@/lib/formulario";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

const SIN_PERMISO: EstadoFormulario = {
  ok: false,
  mensaje: "Solo un administrador configura la IA.",
};

async function admin() {
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "ia.administrar")) return null;
  return { organizacionId: activa.organizacionId, supabase: await clienteServidor() };
}

const entero = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? Number(v.replace(/[,\s_]/g, "")) : v),
    z.number("Escribe un número").int("Sin decimales").min(0).max(max),
  );
const configuracionSchema = z.object({
  activa: z.boolean(),
  tope_diario_tokens: entero(10_000_000_000),
  tope_mensual_tokens: entero(100_000_000_000),
});

export async function guardarConfiguracionIA(
  _e: EstadoFormulario,
  f: FormData,
): Promise<EstadoFormulario> {
  const c = await admin();
  if (!c) return SIN_PERMISO;
  const d = configuracionSchema.safeParse({
    activa: f.get("activa") === "on",
    tope_diario_tokens: f.get("tope_diario_tokens"),
    tope_mensual_tokens: f.get("tope_mensual_tokens"),
  });
  if (!d.success) return { ok: false, mensaje: d.error.issues[0]?.message ?? "Datos inválidos." };
  if (d.data.tope_mensual_tokens < d.data.tope_diario_tokens) {
    return { ok: false, mensaje: "El tope mensual no puede ser menor que el diario." };
  }
  const { error } = await c.supabase.rpc("guardar_configuracion_ia", {
    p_organizacion: c.organizacionId,
    p_activa: d.data.activa,
    p_tope_diario: d.data.tope_diario_tokens,
    p_tope_mensual: d.data.tope_mensual_tokens,
  });
  if (error) return { ok: false, mensaje: mensajeDeError(error, "guardarConfiguracionIA") };
  revalidatePath("/ia");
  refresh();
  return { ok: true, mensaje: "Configuración guardada." };
}

const precio = z.preprocess(
  (v) => (typeof v === "string" ? Number(v.replace(/[,$\s]/g, "")) : v),
  z.number("Escribe un precio").min(0).max(100_000),
);
const precioSchema = z.object({
  proveedor: z.enum(PROVEEDORES_IA),
  modelo: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9._:-]{1,80}$/, "Nombre de modelo inválido"),
  usd_millon_entrada: precio,
  usd_millon_salida: precio,
});

export async function guardarPrecioIA(
  _e: EstadoFormulario,
  f: FormData,
): Promise<EstadoFormulario> {
  const c = await admin();
  if (!c) return SIN_PERMISO;
  const d = precioSchema.safeParse({
    proveedor: f.get("proveedor"),
    modelo: f.get("modelo"),
    usd_millon_entrada: f.get("usd_millon_entrada"),
    usd_millon_salida: f.get("usd_millon_salida"),
  });
  if (!d.success) return { ok: false, mensaje: d.error.issues[0]?.message ?? "Datos inválidos." };
  const { error } = await c.supabase
    .from("precio_ia")
    .upsert(
      { organizacion_id: c.organizacionId, ...d.data },
      { onConflict: "organizacion_id,proveedor,modelo" },
    );
  if (error) return { ok: false, mensaje: mensajeDeError(error, "guardarPrecioIA") };
  revalidatePath("/ia");
  refresh();
  return { ok: true, mensaje: "Precio guardado." };
}

export async function eliminarPrecioIA(f: FormData): Promise<void> {
  const c = await admin();
  const id = z.uuid().safeParse(f.get("id"));
  if (!c || !id.success) return;
  await c.supabase
    .from("precio_ia")
    .delete()
    .eq("id", id.data)
    .eq("organizacion_id", c.organizacionId);
  revalidatePath("/ia");
  refresh();
}

const encargoSchema = z.object({
  encargo_id: z.uuid(),
  proveedores: z.array(z.enum(PROVEEDORES_IA)),
});

/** Proveedores a los que un encargo permite enviar documentos (vacío = IA apagada en el encargo). */
export async function configurarIAEncargo(
  _e: EstadoFormulario,
  f: FormData,
): Promise<EstadoFormulario> {
  const c = await admin();
  if (!c) return SIN_PERMISO;
  const d = encargoSchema.safeParse({
    encargo_id: f.get("encargo_id"),
    proveedores: f.getAll("proveedores"),
  });
  if (!d.success) return { ok: false, mensaje: "Datos inválidos." };
  const { data, error } = await c.supabase
    .from("encargo")
    .update({ ia_proveedores: d.data.proveedores })
    .eq("id", d.data.encargo_id)
    .eq("organizacion_id", c.organizacionId)
    .select("id");
  if (error) return { ok: false, mensaje: mensajeDeError(error, "configurarIAEncargo") };
  if (!data?.length) return { ok: false, mensaje: "El encargo no existe o no tienes acceso." };
  revalidatePath("/ia");
  refresh();
  return {
    ok: true,
    mensaje: d.data.proveedores.length
      ? "Guardado. Los documentos de este encargo pueden enviarse a los proveedores marcados."
      : "Guardado. La IA queda apagada en este encargo.",
  };
}
