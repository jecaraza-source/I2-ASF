"use server";

import { construirCaptura } from "@sigma/importador/captura";
import { puede, type Json } from "@sigma/modelo";
import { z } from "zod";
import { mensajeDeError } from "@/lib/errores-db";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

export type ResultadoCaptura =
  | { ok: true; registroId: string }
  | { ok: false; mensaje: string; errores?: Record<string, string> };

const referencia = z.object({ encargoId: z.uuid(), tipoDocumentoId: z.uuid() });

/**
 * Captura manual (§6): registro sin archivo, con fuente declarada obligatoria. La validación y la
 * normalización corren en el servidor con las mismas funciones que el importador.
 */
export async function capturarRegistro(entrada: unknown): Promise<ResultadoCaptura> {
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "registro.capturar")) {
    return { ok: false, mensaje: "Tu rol no permite capturar registros." };
  }
  const ref = referencia.safeParse(entrada);
  if (!ref.success)
    return {
      ok: false,
      mensaje: "Elige el tipo de documento.",
      errores: { tipoDocumentoId: "Elige el tipo de documento" },
    };

  const supabase = await clienteServidor();
  const [{ data: encargo }, { data: tipo }] = await Promise.all([
    supabase
      .from("encargo")
      .select("id")
      .eq("id", ref.data.encargoId)
      .eq("organizacion_id", activa.organizacionId)
      .maybeSingle(),
    supabase
      .from("tipo_documento")
      .select("clave, nombre, campos_esperados")
      .eq("id", ref.data.tipoDocumentoId)
      .eq("organizacion_id", activa.organizacionId)
      .maybeSingle(),
  ]);
  if (!encargo) return { ok: false, mensaje: "El encargo no existe o no tienes acceso." };
  if (!tipo) return { ok: false, mensaje: "El tipo de documento no existe en tu organización." };

  const r = construirCaptura(entrada, tipo);
  if (!r.ok) return r;
  const { data, error } = await supabase.rpc("capturar_registro", {
    p: JSON.parse(JSON.stringify(r.carga)) as Json,
  });
  if (error || typeof data !== "string") {
    return { ok: false, mensaje: mensajeDeError(error, "capturarRegistro") };
  }
  return { ok: true, registroId: data };
}
