"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import type { EstadoFormulario } from "@/lib/formulario";
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
  if (error) {
    return { ok: false, mensaje: "Correo o contraseña incorrectos.", valores: { email } };
  }
  redirect(destinoSeguro(datos.data.siguiente));
}

export async function cerrarSesion(): Promise<void> {
  const supabase = await clienteServidor();
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
