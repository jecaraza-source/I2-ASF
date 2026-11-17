"use server";

import { altaUsuarioSchema, erroresPorCampo, puede, rolSchema } from "@sigma/modelo";
import { refresh, revalidatePath } from "next/cache";
import { z } from "zod";
import { valoresDe, type EstadoFormulario } from "@/lib/formulario";
import { origenPeticion } from "@/lib/peticion";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";
import { crearCuenta } from "@/lib/usuarios-admin";

const SIN_PERMISO: EstadoFormulario = {
  ok: false,
  mensaje: "Solo un administrador gestiona los usuarios.",
};

/** Traduce los candados de la base (migración 17) sin exponer detalles. */
function mensajeCandado(error: { code?: string; message?: string }, contexto: string): string {
  console.error(`[${contexto}] error de base: ${error.code ?? "desconocido"}`);
  const m = error.message ?? "";
  if (m.startsWith("ultimo_admin")) {
    return "No se puede: la organización se quedaría sin administrador activo.";
  }
  if (m.startsWith("propio_acceso")) {
    return "No puedes cambiar tu propio rol ni darte de baja. Pídelo a otro administrador.";
  }
  if (error.code === "42501") return "Solo un administrador gestiona los usuarios.";
  return "No se pudo guardar. Intenta de nuevo.";
}

function listo() {
  revalidatePath("/usuarios");
  refresh();
}

export async function agregarUsuario(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { activa } = await requerirOrganizacion();
  // La contraseña nunca regresa al formulario.
  const valores = valoresDe(formData);
  delete valores.contrasena;
  if (!puede(activa.rol, "usuarios.administrar")) return { ...SIN_PERMISO, valores };
  const datos = altaUsuarioSchema.safeParse({
    correo: formData.get("correo"),
    rol: formData.get("rol"),
    modo: formData.get("modo"),
    contrasena: formData.get("contrasena") || undefined,
  });
  if (!datos.success) {
    return {
      ok: false,
      mensaje: "Revisa los campos marcados.",
      errores: erroresPorCampo(datos.error),
      valores,
    };
  }
  const { correo, rol, modo, contrasena } = datos.data;
  const supabase = await clienteServidor();

  // ¿Ya tiene cuenta (p. ej. en otra organización)? Entonces solo se le da acceso a esta.
  const { data: existente, error: errorBusqueda } = await supabase.rpc("usuario_por_correo", {
    p_organizacion_id: activa.organizacionId,
    p_correo: correo,
  });
  if (errorBusqueda) {
    return { ok: false, mensaje: mensajeCandado(errorBusqueda, "agregarUsuario"), valores };
  }

  let usuarioId = existente;
  if (!usuarioId) {
    const origen = await origenPeticion();
    const cuenta = await crearCuenta({
      correo,
      modo,
      contrasena,
      regreso: origen ? `${origen}/acceso/contrasena` : null,
    });
    if (!cuenta.ok) {
      const mensaje = {
        sin_servicio:
          "El servidor no tiene configurada la clave de servicio; no se pueden crear cuentas.",
        limite_correo:
          "El servicio de correo llegó a su límite de envíos. Espera una hora o usa una contraseña temporal.",
        ya_existe: "Ese correo ya tiene una cuenta. Intenta de nuevo.",
        error: "No se pudo crear la cuenta. Intenta de nuevo.",
      }[cuenta.motivo];
      return { ok: false, mensaje, valores };
    }
    usuarioId = cuenta.usuarioId;
  }

  const { error } = await supabase
    .from("miembro")
    .insert({ organizacion_id: activa.organizacionId, usuario_id: usuarioId, rol });
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        mensaje: "Revisa los campos marcados.",
        errores: {
          correo: ["Ese correo ya es usuario de la organización (revisa si está de baja)"],
        },
        valores,
      };
    }
    return { ok: false, mensaje: mensajeCandado(error, "agregarUsuario"), valores };
  }
  listo();
  return {
    ok: true,
    mensaje: existente
      ? "Usuario agregado. Ya tenía cuenta en la plataforma: entra con su contraseña de siempre."
      : modo === "invitacion"
        ? "Invitación enviada. El usuario define su contraseña desde el enlace del correo."
        : "Usuario creado. Entrégale la contraseña temporal por un medio seguro y pídele cambiarla al entrar.",
  };
}

const idSchema = z.uuid();

export async function cambiarRolUsuario(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "usuarios.administrar")) return SIN_PERMISO;
  const id = idSchema.safeParse(formData.get("miembro_id"));
  const rol = rolSchema.safeParse(formData.get("rol"));
  if (!id.success || !rol.success) return { ok: false, mensaje: "Elige un rol válido." };
  const supabase = await clienteServidor();
  const { data, error } = await supabase
    .from("miembro")
    .update({ rol: rol.data })
    .eq("id", id.data)
    .eq("organizacion_id", activa.organizacionId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, mensaje: mensajeCandado(error, "cambiarRolUsuario") };
  if (!data) return SIN_PERMISO;
  listo();
  return { ok: true, mensaje: "Rol actualizado." };
}

export async function cambiarEstadoUsuario(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "usuarios.administrar")) return SIN_PERMISO;
  const id = idSchema.safeParse(formData.get("miembro_id"));
  const activo = formData.get("activo") === "true";
  if (!id.success) return { ok: false, mensaje: "Usuario no válido." };
  const supabase = await clienteServidor();
  const { data, error } = await supabase
    .from("miembro")
    .update({ activo })
    .eq("id", id.data)
    .eq("organizacion_id", activa.organizacionId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, mensaje: mensajeCandado(error, "cambiarEstadoUsuario") };
  if (!data) return SIN_PERMISO;
  listo();
  return { ok: true, mensaje: activo ? "Usuario reactivado." : "Usuario dado de baja." };
}
