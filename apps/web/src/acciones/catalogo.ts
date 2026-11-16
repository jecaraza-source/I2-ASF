"use server";

import {
  categoriaFormSchema,
  erroresPorCampo,
  puede,
  tipoDocumentoFormSchema,
} from "@sigma/modelo";
import { redirect } from "next/navigation";
import { z } from "zod";
import { mensajeDeError } from "@/lib/errores-db";
import { valoresDe, type EstadoFormulario } from "@/lib/formulario";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

const SIN_PERMISO: EstadoFormulario = {
  ok: false,
  mensaje: "Solo un administrador edita el catálogo.",
};
const idOpcional = z.uuid().optional().catch(undefined);
const encargoSchema = z.uuid();

/** Ruta de regreso: la configuración del encargo desde la que se editó. */
function regreso(formData: FormData): string {
  const encargo = encargoSchema.safeParse(formData.get("encargo_id"));
  return encargo.success ? `/encargos/${encargo.data}/configuracion` : "/encargos";
}

export async function guardarCategoria(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { activa } = await requerirOrganizacion();
  const valores = valoresDe(formData);
  if (!puede(activa.rol, "catalogo.editar")) return { ...SIN_PERMISO, valores };
  const id = idOpcional.parse(formData.get("id") || undefined);
  const datos = categoriaFormSchema.safeParse(valores);
  if (!datos.success) {
    return {
      ok: false,
      mensaje: "Revisa los campos marcados.",
      errores: erroresPorCampo(datos.error),
      valores,
    };
  }
  const supabase = await clienteServidor();
  const { data, error } = id
    ? await supabase
        .from("categoria_documental")
        .update(datos.data)
        .eq("id", id)
        .eq("organizacion_id", activa.organizacionId)
        .select("id")
        .maybeSingle()
    : await supabase
        .from("categoria_documental")
        .insert({ ...datos.data, organizacion_id: activa.organizacionId })
        .select("id")
        .single();
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        mensaje: "Revisa los campos marcados.",
        errores: { nombre: ["Ya existe esa categoría"] },
        valores,
      };
    }
    return { ok: false, mensaje: mensajeDeError(error, "guardarCategoria"), valores };
  }
  if (!data) return { ...SIN_PERMISO, valores };
  redirect(regreso(formData));
}

export async function guardarTipoDocumento(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { activa } = await requerirOrganizacion();
  const valores = valoresDe(formData);
  if (!puede(activa.rol, "catalogo.editar")) return { ...SIN_PERMISO, valores };
  const id = idOpcional.parse(formData.get("id") || undefined);
  const datos = tipoDocumentoFormSchema.safeParse(valores);
  if (!datos.success) {
    return {
      ok: false,
      mensaje: "Revisa los campos marcados.",
      errores: erroresPorCampo(datos.error),
      valores,
    };
  }
  const supabase = await clienteServidor();
  const { data, error } = id
    ? await supabase
        .from("tipo_documento")
        .update(datos.data)
        .eq("id", id)
        .eq("organizacion_id", activa.organizacionId)
        .select("id")
        .maybeSingle()
    : await supabase
        .from("tipo_documento")
        .insert({ ...datos.data, organizacion_id: activa.organizacionId })
        .select("id")
        .single();
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        mensaje: "Revisa los campos marcados.",
        errores: { clave: ["Ya existe un tipo con esa clave"] },
        valores,
      };
    }
    return { ok: false, mensaje: mensajeDeError(error, "guardarTipoDocumento"), valores };
  }
  if (!data) return { ...SIN_PERMISO, valores };
  redirect(regreso(formData));
}
