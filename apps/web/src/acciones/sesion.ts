"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { EstadoFormulario } from "@/lib/formulario";
import { datosAcceso } from "@/lib/peticion";
import { COOKIE_ORGANIZACION, obtenerSesion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

const ingresoSchema = z.object({
  email: z.email({ error: "Correo inválido" }).trim().toLowerCase(),
  password: z.string().min(1, "Escribe tu contraseña"),
  siguiente: z.string().optional(),
});

/** Solo rutas internas: evita redirecciones abiertas. */
function destinoSeguro(siguiente: string | undefined): string {
  if (siguiente && /^\/(?!\/)[\w\-/]*$/.test(siguiente) && !siguiente.startsWith("/ingresar")) {
    return siguiente;
  }
  return "/encargos";
}

export async function iniciarSesion(
  _estado: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const datos = ingresoSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
    siguiente: formData.get("siguiente") ?? undefined,
  });
  const email = String(formData.get("email") ?? "");
  if (!datos.success) {
    return { ok: false, mensaje: "Revisa el correo y la contraseña.", valores: { email } };
  }
  const supabase = await clienteServidor();
  const { error } = await supabase.auth.signInWithPassword({
    email: datos.data.email,
    password: datos.data.password,
  });
  const { ip, navegador } = await datosAcceso();
  if (error) {
    // Bitácora de acceso: el intento fallido se atribuye al usuario si el correo existe.
    await supabase.rpc("registrar_acceso_fallido", {
      p_correo: datos.data.email,
      p_ip: ip ?? undefined,
      p_navegador: navegador ?? undefined,
    });
    return { ok: false, mensaje: "Correo o contraseña incorrectos.", valores: { email } };
  }
  await registrar(supabase, "inicio", ip, navegador);
  redirect(destinoSeguro(datos.data.siguiente));
}

type Cliente = Awaited<ReturnType<typeof clienteServidor>>;

/** La bitácora de acceso nunca impide entrar o salir: si falla, se anota el código y se sigue. */
async function registrar(
  supabase: Cliente,
  tipo: "inicio" | "cierre",
  ip: string | null,
  navegador: string | null,
) {
  const { error } = await supabase.rpc("registrar_acceso", {
    p_tipo: tipo,
    p_ip: ip ?? undefined,
    p_navegador: navegador ?? undefined,
  });
  if (error) console.error(`[acceso] no se registró el ${tipo}: ${error.code ?? "desconocido"}`);
}

/** Primer acceso por enlace de invitación (la sesión se creó en el navegador). */
export async function registrarAccesoPorEnlace(): Promise<void> {
  const supabase = await clienteServidor();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return;
  const { ip, navegador } = await datosAcceso();
  await registrar(supabase, "inicio", ip, navegador);
}

export async function cerrarSesion(): Promise<void> {
  const supabase = await clienteServidor();
  const { ip, navegador } = await datosAcceso();
  await registrar(supabase, "cierre", ip, navegador);
  await supabase.auth.signOut();
  (await cookies()).delete(COOKIE_ORGANIZACION);
  redirect("/ingresar");
}

export async function elegirOrganizacion(formData: FormData): Promise<void> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/ingresar");
  const id = String(formData.get("organizacion_id") ?? "");
  // La cookie solo se acepta si el usuario es miembro; aun así RLS decide el acceso.
  if (!sesion.membresias.some((m) => m.organizacionId === id)) redirect("/organizacion");
  (await cookies()).set(COOKIE_ORGANIZACION, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/encargos");
}
