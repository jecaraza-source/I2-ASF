"use server";

import { encargoFormSchema, erroresPorCampo, expedienteFormSchema, puede } from "@sigma/modelo";
import { redirect } from "next/navigation";
import { z } from "zod";
import { mensajeDeError } from "@/lib/errores-db";
import { valoresDe, type EstadoFormulario } from "@/lib/formulario";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

const SIN_PERMISO: EstadoFormulario = { ok: false, mensaje: "Tu rol no permite esta acción." };
const idOpcional = z.uuid().optional().catch(undefined);

export async function guardarEncargo(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { activa } = await requerirOrganizacion();
  const valores = valoresDe(formData);
  const id = idOpcional.parse(formData.get("id") || undefined);
  if (!puede(activa.rol, id ? "encargo.editar" : "encargo.crear"))
    return { ...SIN_PERMISO, valores };

  const datos = encargoFormSchema.safeParse(valores);
  if (!datos.success) {
    return {
      ok: false,
      mensaje: "Revisa los campos marcados.",
      errores: erroresPorCampo(datos.error),
      valores,
    };
  }
  const fila = {
    nombre: datos.data.nombre,
    tipo_auditoria: datos.data.tipo_auditoria ?? null,
    umbral_confianza: datos.data.umbral_confianza,
    periodo_inicio: datos.data.periodo_inicio ?? null,
    periodo_fin: datos.data.periodo_fin ?? null,
    estado: datos.data.estado,
  };

  const supabase = await clienteServidor();
  const { data, error } = id
    ? await supabase
        .from("encargo")
        .update(fila)
        .eq("id", id)
        .eq("organizacion_id", activa.organizacionId)
        .select("id")
        .maybeSingle()
    : await supabase
        .from("encargo")
        .insert({ ...fila, organizacion_id: activa.organizacionId })
        .select("id")
        .single();

  if (error) return { ok: false, mensaje: mensajeDeError(error, "guardarEncargo"), valores };
  if (!data) return { ...SIN_PERMISO, valores };
  redirect(`/encargos/${data.id}`);
}

export async function guardarExpediente(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { activa } = await requerirOrganizacion();
  const valores = valoresDe(formData);
  const id = idOpcional.parse(formData.get("id") || undefined);
  const encargoId = z.uuid().safeParse(formData.get("encargo_id"));
  if (!encargoId.success) return { ok: false, mensaje: "Encargo inválido.", valores };
  if (!puede(activa.rol, id ? "expediente.editar" : "expediente.crear")) {
    return { ...SIN_PERMISO, valores };
  }

  const datos = expedienteFormSchema.safeParse(valores);
  if (!datos.success) {
    return {
      ok: false,
      mensaje: "Revisa los campos marcados.",
      errores: erroresPorCampo(datos.error),
      valores,
    };
  }

  const supabase = await clienteServidor();
  // El encargo debe ser visible para el usuario y de la organización activa.
  const { data: encargo } = await supabase
    .from("encargo")
    .select("id")
    .eq("id", encargoId.data)
    .eq("organizacion_id", activa.organizacionId)
    .maybeSingle();
  if (!encargo) return { ok: false, mensaje: "El encargo no existe o no tienes acceso.", valores };

  const fila = {
    numero_control: datos.data.numero_control ?? null,
    descripcion: datos.data.descripcion ?? null,
  };

  const { data, error } = id
    ? await supabase
        .from("expediente")
        .update({
          ...fila,
          ...(datos.data.identificador ? { identificador: datos.data.identificador } : {}),
        })
        .eq("id", id)
        .eq("encargo_id", encargo.id)
        .select("id")
        .maybeSingle()
    : await supabase
        .from("expediente")
        .insert({
          ...fila,
          // Sin identificador, la base genera EXP-AAAA-NNNN.
          identificador: datos.data.identificador ?? "",
          organizacion_id: activa.organizacionId,
          encargo_id: encargo.id,
        })
        .select("id")
        .single();

  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        mensaje: "Revisa los campos marcados.",
        errores: {
          identificador: ["Ya existe un expediente con ese identificador en este encargo"],
        },
        valores,
      };
    }
    return { ok: false, mensaje: mensajeDeError(error, "guardarExpediente"), valores };
  }
  if (!data) return { ...SIN_PERMISO, valores };
  redirect(`/encargos/${encargo.id}/expedientes/${data.id}`);
}
