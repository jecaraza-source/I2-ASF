import "server-only";
import { rolSchema, type Rol } from "@sigma/modelo";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { clienteServidor } from "@/lib/supabase/servidor";

export const COOKIE_ORGANIZACION = "sigma_org";

export type Membresia = { organizacionId: string; nombre: string; rol: Rol };

export type Sesion = {
  usuario: { id: string; email: string | null };
  membresias: Membresia[];
  /** Organización activa; null si hay varias y aún no se elige, o si no hay ninguna. */
  activa: Membresia | null;
};

/**
 * Capa de acceso a la sesión (una vez por petición). Lee el usuario validado
 * por Supabase, sus membresías y la organización activa (cookie validada contra
 * las membresías: la cookie sola no da acceso a nada).
 */
export const obtenerSesion = cache(async (): Promise<Sesion | null> => {
  const supabase = await clienteServidor();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;

  const { data: filas } = await supabase
    .from("miembro")
    .select("organizacion_id, rol, organizacion:organizacion_id (nombre)")
    .eq("usuario_id", data.user.id)
    .eq("activo", true);

  const membresias: Membresia[] = (filas ?? [])
    .map((f) => {
      const rol = rolSchema.safeParse(f.rol);
      if (!rol.success) return null;
      return {
        organizacionId: f.organizacion_id,
        nombre: f.organizacion?.nombre ?? "Organización",
        rol: rol.data,
      };
    })
    .filter((m): m is Membresia => m !== null)
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const elegida = (await cookies()).get(COOKIE_ORGANIZACION)?.value;
  const activa =
    membresias.find((m) => m.organizacionId === elegida) ??
    (membresias.length === 1 ? (membresias[0] ?? null) : null);

  return { usuario: { id: data.user.id, email: data.user.email ?? null }, membresias, activa };
});

/** Exige sesión; si no hay, manda a /ingresar. */
export async function requerirSesion(): Promise<Sesion> {
  const sesion = await obtenerSesion();
  if (!sesion) redirect("/ingresar");
  return sesion;
}

/** Exige sesión y organización activa. */
export async function requerirOrganizacion(): Promise<Sesion & { activa: Membresia }> {
  const sesion = await requerirSesion();
  if (!sesion.activa) redirect("/organizacion");
  return { ...sesion, activa: sesion.activa };
}
