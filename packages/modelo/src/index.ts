import { z } from "zod";

/** Roles de un miembro dentro de una organización (docs/ESPECIFICACION.md §3). */
export const rolSchema = z.enum(["admin", "auditor", "lector"]);
export type Rol = z.infer<typeof rolSchema>;

/** Origen de un registro (docs/ESPECIFICACION.md §2). */
export const origenRegistroSchema = z.enum(["documento", "captura", "importacion"]);
export type OrigenRegistro = z.infer<typeof origenRegistroSchema>;
