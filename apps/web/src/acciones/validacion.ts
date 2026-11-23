"use server";

import { construirValidacion } from "@sigma/importador/validacion";
import { puede, type Json } from "@sigma/modelo";
import { z } from "zod";
import { ejecutarYGuardarReglas } from "@/lib/reglas-datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

export type ResultadoValidacion =
  | { ok: true; registroId: string }
  | { ok: false; mensaje: string; errores?: Record<string, string> };

const SIN_PERMISO = { ok: false as const, mensaje: "Tu rol no permite validar registros." };
const referencia = z.object({ encargoId: z.uuid(), registroId: z.uuid() });

/** Traduce los errores de `validar_registro` y `rechazar_registro` sin exponer detalles. */
function mensajeBase(error: { code?: string; message?: string } | null, contexto: string): string {
  console.error(`[${contexto}] error de base: ${error?.code ?? "desconocido"}`);
  const m = error?.message ?? "";
  if (m.startsWith("ya_validado")) {
    return "Este registro ya no está en la cola: alguien más lo validó o lo rechazó.";
  }
  if (m.startsWith("sin_datos"))
    return "Deja al menos un dato o un involucrado, o rechaza el registro.";
  if (m.startsWith("motivo")) return "Explica el motivo del rechazo (al menos 5 caracteres).";
  if (error?.code === "42501" || error?.code === "P0002") return SIN_PERMISO.mensaje;
  return "No se pudo guardar. Intenta de nuevo.";
}

/**
 * Validación de una lectura de la IA (§7.2). El servidor compara lo que confirma el auditor con lo
 * que leyó la IA y decide qué se aceptó, qué se corrigió y qué se rechazó; el navegador no decide.
 * Solo aquí nacen entidades y eventos de un documento.
 */
export async function validarRegistro(
  registroId: string,
  entrada: unknown,
): Promise<ResultadoValidacion> {
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "registro.validar")) return SIN_PERMISO;
  const base = entrada && typeof entrada === "object" ? entrada : {};
  const ref = referencia.safeParse({ ...base, registroId });
  if (!ref.success) return { ok: false, mensaje: "Registro no válido." };

  const supabase = await clienteServidor();
  const { data: registro } = await supabase
    .from("registro")
    .select(
      "id, encargo_id, organizacion_id, tipo_documento_id, tipo_documento(clave, nombre, campos_esperados)",
    )
    .eq("id", ref.data.registroId)
    .eq("encargo_id", ref.data.encargoId)
    .eq("organizacion_id", activa.organizacionId)
    .maybeSingle();
  if (!registro?.tipo_documento || !registro.tipo_documento_id) {
    return { ok: false, mensaje: "El registro no existe o no tienes acceso." };
  }
  const { data: lecturas, error: errorLecturas } = await supabase
    .from("extraccion")
    .select("id, campo, valor_crudo, valor_normalizado")
    .eq("registro_id", registro.id)
    .eq("metodo", "ia")
    .neq("estado", "reemplazado")
    .order("creado_en");
  if (errorLecturas) return { ok: false, mensaje: mensajeBase(errorLecturas, "validarRegistro") };

  // El tipo de documento es el del registro, no el que diga el navegador.
  const r = construirValidacion(
    { ...base, tipoDocumentoId: registro.tipo_documento_id },
    registro.tipo_documento,
    registro.id,
    lecturas ?? [],
  );
  if (!r.ok) return r;
  const { error } = await supabase.rpc("validar_registro", {
    p: JSON.parse(JSON.stringify(r.carga)) as Json,
  });
  if (error) return { ok: false, mensaje: mensajeBase(error, "validarRegistro") };
  // Lo validado ya cuenta para las reglas. Si fallan, la validación quedó guardada y se pueden
  // ejecutar desde Alertas.
  const reglas = await ejecutarYGuardarReglas(supabase, registro.encargo_id);
  if (!reglas.ok) console.error(`[reglasTrasValidar] error de base: ${reglas.codigo ?? "?"}`);
  return { ok: true, registroId: registro.id };
}

export async function rechazarRegistro(
  registroId: string,
  motivo: string,
): Promise<ResultadoValidacion> {
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "registro.validar")) return SIN_PERMISO;
  const id = z.uuid().safeParse(registroId);
  const texto = z.string().trim().min(5).max(500).safeParse(motivo);
  if (!id.success) return { ok: false, mensaje: "Registro no válido." };
  if (!texto.success) {
    return { ok: false, mensaje: "Explica el motivo del rechazo (al menos 5 caracteres)." };
  }
  const supabase = await clienteServidor();
  const { error } = await supabase.rpc("rechazar_registro", {
    p_registro: id.data,
    p_motivo: texto.data,
  });
  if (error) return { ok: false, mensaje: mensajeBase(error, "rechazarRegistro") };
  return { ok: true, registroId: id.data };
}
