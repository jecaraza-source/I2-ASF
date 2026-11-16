/**
 * Esquemas zod de las entidades principales del dominio (docs/ESPECIFICACION.md §2).
 * Validan los datos en las fronteras (server actions, route handlers, respuestas de la base).
 * Los valores permitidos replican los `check` de supabase/migrations.
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// Primitivos
// ---------------------------------------------------------------------------

export const uuidSchema = z.uuid();

/** Marca de tiempo tal como la devuelve PostgREST (ISO 8601 con zona). */
export const marcaTiempoSchema = z.string().min(1);

/** Fecha ISO 8601 (aaaa-mm-dd). */
export const fechaSchema = z.iso.date();

/** SHA-256 en hexadecimal en minúsculas. */
export const sha256Schema = z.string().regex(/^[0-9a-f]{64}$/, "SHA-256 inválido");

/** Código de moneda ISO 4217. */
export const monedaSchema = z.string().regex(/^[A-Z]{3}$/, "Moneda ISO 4217 inválida");

/**
 * Monto numeric(18,2) con signo. Se acepta número o texto: los montos grandes
 * deben viajar como texto para no perder precisión en JavaScript.
 */
export const montoSchema = z.union([
  z.number().finite(),
  z.string().regex(/^-?\d{1,16}(\.\d{1,2})?$/, "Monto inválido"),
]);

const jsonObjetoSchema = z.record(z.string(), z.unknown());

// ---------------------------------------------------------------------------
// Catálogos de valores (checks de la base)
// ---------------------------------------------------------------------------

export const rolSchema = z.enum(["admin", "auditor", "lector"]);
export const estadoEncargoSchema = z.enum(["activo", "cerrado", "archivado"]);
export const origenRegistroSchema = z.enum(["documento", "captura", "importacion"]);
export const estadoValidacionSchema = z.enum(["pendiente", "validado", "corregido", "rechazado"]);
export const metodoExtraccionSchema = z.enum(["ia", "manual", "importacion"]);
export const tipoEntidadSchema = z.enum([
  "persona_fisica",
  "persona_moral",
  "cuenta",
  "domicilio",
  "telefono",
  "dependencia",
  "otro",
]);
export const tipoEventoSchema = z.enum(["contrato", "transferencia", "llamada", "pago", "otro"]);
export const rolParticipanteSchema = z.enum(["origen", "destino", "parte"]);
export const nivelSchema = z.enum(["critico", "alto", "medio", "bajo"]);
export const severidadSchema = z.enum(["critica", "alta", "media", "baja"]);
export const estadoAlertaSchema = z.enum(["abierta", "confirmada", "descartada"]);
export const objetoEvidenciaSchema = z.enum(["entidad", "vinculo", "evento", "alerta"]);

/** Ubicación exacta de una extracción en su origen (regla 1). */
export const ubicacionSchema = z
  .object({
    pagina: z.number().int().positive().optional(),
    hoja: z.string().min(1).optional(),
    fila: z.number().int().positive().optional(),
    celda: z.string().min(1).optional(),
  })
  .catchall(z.unknown());

// ---------------------------------------------------------------------------
// Entidades principales (forma de fila)
// ---------------------------------------------------------------------------

const comunes = {
  id: uuidSchema,
  organizacion_id: uuidSchema,
  creado_en: marcaTiempoSchema,
  creado_por: uuidSchema.nullable(),
};

const delEncargo = { ...comunes, encargo_id: uuidSchema };

export const organizacionSchema = z.object({
  id: uuidSchema,
  nombre: z.string().trim().min(1),
  creado_en: marcaTiempoSchema,
  creado_por: uuidSchema.nullable(),
});

export const miembroSchema = z.object({
  ...comunes,
  usuario_id: uuidSchema,
  rol: rolSchema,
});

export const encargoSchema = z.object({
  ...comunes,
  nombre: z.string().trim().min(1),
  tipo_auditoria: z.string().nullable(),
  umbral_confianza: z.number().min(0).max(1),
  periodo_inicio: fechaSchema.nullable(),
  periodo_fin: fechaSchema.nullable(),
  estado: estadoEncargoSchema,
});

export const expedienteSchema = z.object({
  ...delEncargo,
  numero_control: z.string().nullable(),
  identificador: z.string().min(1),
  descripcion: z.string().nullable(),
});

export const documentoOrigenSchema = z.object({
  ...delEncargo,
  expediente_id: uuidSchema.nullable(),
  sha256: sha256Schema,
  storage_path: z.string().min(1),
  nombre_archivo: z.string().min(1),
  mime: z.string().nullable(),
  tamano: z.number().int().nonnegative().nullable(),
  folio: z.string().nullable(),
  fuente: z.string().nullable(),
  recibido_por: uuidSchema.nullable(),
  recibido_en: marcaTiempoSchema,
  original_id: uuidSchema.nullable(),
});

export const registroSchema = z
  .object({
    ...delEncargo,
    expediente_id: uuidSchema.nullable(),
    tipo_documento_id: uuidSchema.nullable(),
    origen: origenRegistroSchema,
    documento_id: uuidSchema.nullable(),
    fuente: z.string().nullable(),
    fecha_documento: fechaSchema.nullable(),
    estado_validacion: estadoValidacionSchema,
    resumen: z.string().nullable(),
  })
  .refine((r) => r.origen !== "documento" || r.documento_id !== null, {
    message: "Un registro de documento debe apuntar a su documento",
    path: ["documento_id"],
  })
  .refine((r) => r.origen !== "captura" || (r.fuente ?? "").trim().length > 0, {
    message: "Una captura requiere fuente declarada",
    path: ["fuente"],
  });

export const extraccionSchema = z
  .object({
    ...delEncargo,
    registro_id: uuidSchema,
    campo: z.string().trim().min(1),
    valor_crudo: z.string().nullable(),
    valor_normalizado: z.unknown().nullable(),
    confianza: z.number().min(0).max(1).nullable(),
    ubicacion: ubicacionSchema,
    metodo: metodoExtraccionSchema,
    estado: estadoValidacionSchema,
    validado_por: uuidSchema.nullable(),
    validado_en: marcaTiempoSchema.nullable(),
  })
  .refine((e) => e.metodo !== "manual" || e.confianza === null, {
    message: "La captura manual no lleva confianza",
    path: ["confianza"],
  });

export const entidadSchema = z.object({
  ...delEncargo,
  tipo: tipoEntidadSchema,
  nombre: z.string().trim().min(1),
  nombre_normalizado: z.string().min(1),
  identificadores: jsonObjetoSchema,
  atributos: jsonObjetoSchema,
  riesgo_declarado: z.string().nullable(),
  fusionada_en: uuidSchema.nullable(),
});

export const vinculoSchema = z.object({
  ...delEncargo,
  origen_id: uuidSchema,
  destino_id: uuidSchema,
  tipo: z.string().min(1),
  fuerza: z.number().int().min(1).max(10).nullable(),
  fuerza_original: z.string().nullable(),
  fecha_inicio: fechaSchema.nullable(),
  dirigido: z.boolean(),
});

export const eventoSchema = z
  .object({
    ...delEncargo,
    tipo: tipoEventoSchema,
    fecha_hora: marcaTiempoSchema.nullable(),
    monto: montoSchema.nullable(),
    moneda: monedaSchema.nullable(),
    atributos: jsonObjetoSchema,
  })
  .refine((e) => e.monto === null || e.moneda !== null, {
    message: "Un monto requiere moneda",
    path: ["moneda"],
  });

export const evidenciaSchema = z.object({
  ...delEncargo,
  objeto_tipo: objetoEvidenciaSchema,
  objeto_id: uuidSchema,
  registro_id: uuidSchema,
  extraccion_id: uuidSchema.nullable(),
});

export const alertaSchema = z.object({
  ...delEncargo,
  regla: z.string().regex(/^R\d{2}/, "Regla inválida"),
  severidad: severidadSchema,
  estado: estadoAlertaSchema,
  detalle: jsonObjetoSchema,
  resuelta_por: uuidSchema.nullable(),
});

export const calificacionSchema = z
  .object({
    ...delEncargo,
    red_id: uuidSchema,
    objeto_tipo: z.enum(["entidad", "vinculo"]),
    objeto_id: uuidSchema,
    puntaje: z.number().min(0).max(100),
    nivel: nivelSchema,
    criterios: z.array(z.unknown()),
    ajuste_nivel: nivelSchema.nullable(),
    ajuste_motivo: z.string().nullable(),
    ajustado_por: uuidSchema.nullable(),
  })
  .refine((c) => c.ajuste_nivel === null || (c.ajuste_motivo ?? "").trim().length > 0, {
    message: "El ajuste de nivel requiere motivo",
    path: ["ajuste_motivo"],
  });

export const bitacoraSchema = z.object({
  ...comunes,
  encargo_id: uuidSchema.nullable(),
  actor: uuidSchema.nullable(),
  accion: z.string().min(1),
  objeto_tipo: z.string().min(1),
  objeto_id: uuidSchema.nullable(),
  detalle: jsonObjetoSchema,
  en: marcaTiempoSchema,
});

// ---------------------------------------------------------------------------
// Tipos inferidos
// ---------------------------------------------------------------------------

export type Rol = z.infer<typeof rolSchema>;
export type OrigenRegistro = z.infer<typeof origenRegistroSchema>;
export type EstadoValidacion = z.infer<typeof estadoValidacionSchema>;
export type TipoEntidad = z.infer<typeof tipoEntidadSchema>;
export type Nivel = z.infer<typeof nivelSchema>;
export type Organizacion = z.infer<typeof organizacionSchema>;
export type Miembro = z.infer<typeof miembroSchema>;
export type Encargo = z.infer<typeof encargoSchema>;
export type Expediente = z.infer<typeof expedienteSchema>;
export type DocumentoOrigen = z.infer<typeof documentoOrigenSchema>;
export type Registro = z.infer<typeof registroSchema>;
export type Extraccion = z.infer<typeof extraccionSchema>;
export type Entidad = z.infer<typeof entidadSchema>;
export type Vinculo = z.infer<typeof vinculoSchema>;
export type Evento = z.infer<typeof eventoSchema>;
export type Evidencia = z.infer<typeof evidenciaSchema>;
export type Alerta = z.infer<typeof alertaSchema>;
export type Calificacion = z.infer<typeof calificacionSchema>;
export type Bitacora = z.infer<typeof bitacoraSchema>;
