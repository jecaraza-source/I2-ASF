"use server";

import {
  categoriaFormSchema,
  erroresPorCampo,
  puede,
  tipoDocumentoFormSchema,
  type Json,
} from "@sigma/modelo";
import { CAMPOS_COMUNES } from "@sigma/importador/captura";
import { refresh } from "next/cache";
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

const ajusteComunSchema = z.object({
  clave: z.enum(CAMPOS_COMUNES.map((c) => c.clave) as [string, ...string[]]),
  usa: z.boolean(),
  etiqueta: z.string().trim().max(80),
});

/**
 * Campos comunes en un tipo de documento (§6): cuáles aplican y con qué nombre. Se guardan como
 * entradas de `campos_esperados` con la clave del campo común; los campos propios no se tocan.
 */
export async function guardarCamposComunes(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "catalogo.editar")) return SIN_PERMISO;
  const id = z.uuid().safeParse(formData.get("id"));
  if (!id.success) return { ok: false, mensaje: "Tipo de documento no válido." };
  const ajustes = [];
  for (const c of CAMPOS_COMUNES) {
    const a = ajusteComunSchema.safeParse({
      clave: c.clave,
      usa: formData.get(`usa_${c.clave}`) === "on",
      etiqueta: String(formData.get(`etiqueta_${c.clave}`) ?? ""),
    });
    if (!a.success) return { ok: false, mensaje: "Revisa los nombres (máximo 80 caracteres)." };
    if (!a.data.usa) ajustes.push({ clave: c.clave, oculto: true });
    else if (a.data.etiqueta && a.data.etiqueta !== c.etiqueta) {
      ajustes.push({ clave: c.clave, etiqueta: a.data.etiqueta });
    }
  }
  const supabase = await clienteServidor();
  const { data: tipo } = await supabase
    .from("tipo_documento")
    .select("campos_esperados")
    .eq("id", id.data)
    .eq("organizacion_id", activa.organizacionId)
    .maybeSingle();
  if (!tipo) return SIN_PERMISO;
  const comunes = new Set(CAMPOS_COMUNES.map((c) => c.clave));
  const propios = (Array.isArray(tipo.campos_esperados) ? tipo.campos_esperados : []).filter(
    (c) => !(c && typeof c === "object" && "clave" in c && comunes.has(String(c.clave))),
  );
  const { data, error } = await supabase
    .from("tipo_documento")
    .update({ campos_esperados: [...propios, ...ajustes] as NonNullable<Json> })
    .eq("id", id.data)
    .eq("organizacion_id", activa.organizacionId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, mensaje: mensajeDeError(error, "guardarCamposComunes") };
  if (!data) return SIN_PERMISO;
  refresh();
  return { ok: true, mensaje: "Campos guardados." };
}
