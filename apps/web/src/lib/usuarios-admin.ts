import "server-only";
import type { ModoAlta } from "@sigma/modelo";
import { clienteServicio } from "@/lib/supabase/servicio";

export type ResultadoCuenta =
  | { ok: true; usuarioId: string }
  | { ok: false; motivo: "sin_servicio" | "limite_correo" | "ya_existe" | "error" };

/**
 * Crea la cuenta de un usuario nuevo con la API de administración de Auth (service role).
 *
 * Segundo uso autorizado de la service role key, junto al procesador de trabajos. Reglas:
 *  - solo se llama desde `acciones/usuarios.ts`, después de comprobar que quien pide es
 *    administrador de la organización;
 *  - aquí solo se crea la cuenta: la membresía (y con ella el acceso) se inserta con el cliente
 *    del administrador, así que RLS y la bitácora deciden y registran el alta;
 *  - la contraseña temporal no se guarda ni se registra en ningún lado.
 */
export async function crearCuenta(p: {
  correo: string;
  modo: ModoAlta;
  contrasena?: string;
  regreso: string | null;
}): Promise<ResultadoCuenta> {
  const servicio = clienteServicio();
  if (!servicio) return { ok: false, motivo: "sin_servicio" };
  const { data, error } =
    p.modo === "invitacion"
      ? await servicio.auth.admin.inviteUserByEmail(
          p.correo,
          p.regreso ? { redirectTo: p.regreso } : undefined,
        )
      : await servicio.auth.admin.createUser({
          email: p.correo,
          password: p.contrasena,
          email_confirm: true,
        });
  if (error || !data.user) {
    const estado = error?.status;
    const codigo = error?.code ?? "desconocido";
    console.error(`[crearCuenta] ${p.modo}: ${estado ?? "sin estado"} ${codigo}`);
    if (estado === 429 || codigo.includes("rate_limit"))
      return { ok: false, motivo: "limite_correo" };
    if (codigo === "email_exists" || codigo === "user_already_exists") {
      return { ok: false, motivo: "ya_existe" };
    }
    return { ok: false, motivo: "error" };
  }
  return { ok: true, usuarioId: data.user.id };
}
