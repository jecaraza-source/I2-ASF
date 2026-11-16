/**
 * Esquemas de los formularios de alta y edición. Reciben valores de FormData
 * (texto) y devuelven datos listos para la base. Mensajes en español.
 */
import { z } from "zod";
import { estadoEncargoSchema } from "./esquemas";

/** Texto opcional: "" o solo espacios se vuelve undefined. */
const textoOpcional = (max = 500) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max, `Máximo ${max} caracteres`).optional(),
  );

const textoRequerido = (campo: string, max = 200) =>
  z
    .string({ error: `${campo} es obligatorio` })
    .trim()
    .min(1, `${campo} es obligatorio`)
    .max(max, `Máximo ${max} caracteres`);

const fechaOpcional = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.iso.date({ error: "Fecha inválida (aaaa-mm-dd)" }).optional(),
);

export const encargoFormSchema = z
  .object({
    nombre: textoRequerido("El nombre"),
    tipo_auditoria: textoOpcional(100),
    umbral_confianza: z.preprocess(
      (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
      z.coerce
        .number({ error: "Debe ser un número" })
        .min(0, "Entre 0 y 1")
        .max(1, "Entre 0 y 1")
        .default(0.85),
    ),
    periodo_inicio: fechaOpcional,
    periodo_fin: fechaOpcional,
    estado: estadoEncargoSchema.default("activo"),
  })
  .refine((e) => !e.periodo_inicio || !e.periodo_fin || e.periodo_fin >= e.periodo_inicio, {
    message: "El fin del periodo no puede ser anterior al inicio",
    path: ["periodo_fin"],
  });

export const expedienteFormSchema = z.object({
  numero_control: textoOpcional(100),
  identificador: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z
      .string()
      .trim()
      .max(100, "Máximo 100 caracteres")
      .regex(/^[\p{L}\p{N}][\p{L}\p{N}._/-]*$/u, "Solo letras, números, punto, guion y diagonal")
      .optional(),
  ),
  descripcion: textoOpcional(2000),
});

export const categoriaFormSchema = z.object({
  nombre: textoRequerido("El nombre", 100),
  orden: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.coerce.number({ error: "Debe ser un número" }).int("Debe ser entero").min(0).default(0),
  ),
});

export const tipoDocumentoFormSchema = z.object({
  clave: z
    .string({ error: "La clave es obligatoria" })
    .trim()
    .min(1, "La clave es obligatoria")
    .max(60, "Máximo 60 caracteres")
    .regex(/^[a-z0-9_]+$/, "Solo minúsculas, números y guion bajo"),
  nombre: textoRequerido("El nombre", 100),
  categoria_id: z.uuid({ error: "Elige una categoría" }),
});

export type EncargoForm = z.infer<typeof encargoFormSchema>;
export type ExpedienteForm = z.infer<typeof expedienteFormSchema>;
export type CategoriaForm = z.infer<typeof categoriaFormSchema>;
export type TipoDocumentoForm = z.infer<typeof tipoDocumentoFormSchema>;

/** Errores por campo en el formato que consumen los formularios. */
export type ErroresCampo = Partial<Record<string, string[]>>;

export function erroresPorCampo(error: z.ZodError): ErroresCampo {
  const errores: ErroresCampo = {};
  for (const issue of error.issues) {
    const campo = String(issue.path[0] ?? "_");
    (errores[campo] ??= []).push(issue.message);
  }
  return errores;
}
