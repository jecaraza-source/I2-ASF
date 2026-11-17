import { z } from "zod";
import { rolSchema, type Rol } from "./esquemas";

export const NOMBRE_ROL: Record<Rol, string> = {
  admin: "Administrador",
  auditor: "Auditor",
  lector: "Lector",
};

export const DESCRIPCION_ROL: Record<Rol, string> = {
  admin: "Todo, incluida la configuración, la IA y los usuarios.",
  auditor: "Crea y valida registros, genera redes y resuelve alertas.",
  lector: "Solo consulta.",
};

export const MODOS_ALTA = ["invitacion", "temporal"] as const;
export type ModoAlta = (typeof MODOS_ALTA)[number];

/** Mínimo para contraseñas definidas en la plataforma. */
export const MIN_CONTRASENA = 12;

export const contrasenaSchema = z
  .string({ error: "Escribe una contraseña" })
  .min(MIN_CONTRASENA, `Mínimo ${MIN_CONTRASENA} caracteres`)
  .max(72, "Máximo 72 caracteres");

export const altaUsuarioSchema = z
  .object({
    correo: z
      .string({ error: "Escribe el correo" })
      .trim()
      .toLowerCase()
      .max(254)
      .pipe(z.email({ error: "Correo inválido" })),
    rol: rolSchema,
    modo: z.enum(MODOS_ALTA),
    contrasena: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.modo !== "temporal") return;
    const c = contrasenaSchema.safeParse(v.contrasena);
    if (!c.success) {
      ctx.addIssue({
        code: "custom",
        path: ["contrasena"],
        message: c.error.issues[0]?.message ?? "Contraseña inválida",
      });
    }
  });
export type AltaUsuario = z.infer<typeof altaUsuarioSchema>;

/** Nombre legible de cada acción de la bitácora de usuarios. */
export const NOMBRE_ACCION_USUARIO: Record<string, string> = {
  "sesion.inicio": "Inicio de sesión",
  "sesion.cierre": "Cierre de sesión",
  "sesion.fallo": "Intento fallido",
  "usuario.alta": "Alta",
  "usuario.rol": "Cambio de rol",
  "usuario.baja": "Baja",
  "usuario.reactivacion": "Reactivación",
};
