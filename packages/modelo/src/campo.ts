import { z } from "zod";

/**
 * Verificación en campo (tarea 14): avisos, límites y formas de lo que envía el teléfono.
 * Cambiar el texto de un aviso exige subir `VERSION_AVISO_CAMPO` y la función
 * `privado.version_aviso_campo()` en una migración: todos vuelven a aceptarlo.
 */
export const VERSION_AVISO_CAMPO = "2026-11-17";

/** Sin señal por poco tiempo: lo que no se envíe en este plazo se descarta del teléfono. */
export const HORAS_MAXIMAS_SIN_ENVIAR = 24;
export const MAX_FOTOS_POR_VISITA = 10;
export const MAX_BYTES_FOTO = 15 * 1024 * 1024;
export const MIMES_FOTO = ["image/jpeg", "image/png", "image/webp", "image/heic"] as const;

/**
 * Compromiso de confidencialidad que acepta quien verifica, antes de descargar visitas.
 * Redacción base: la debe revisar el área jurídica del cliente (Ley General de Protección de Datos
 * Personales en Posesión de Sujetos Obligados y normativa de fiscalización aplicable).
 */
export const AVISO_CONFIDENCIALIDAD: { titulo: string; parrafos: string[] } = {
  titulo: "Aviso de confidencialidad y protección de datos",
  parrafos: [
    "La información de las visitas (nombres, RFC, domicilios, documentos y montos) es reservada y forma parte de un proceso de fiscalización. Solo puedes usarla para realizar la verificación que tienes asignada.",
    "No la compartas, no hagas capturas de pantalla ni copias fuera de esta aplicación, y no la comentes con terceros, incluido el personal del lugar visitado más allá de lo necesario para identificar el domicilio.",
    "Las fotografías se toman únicamente dentro de esta aplicación. Captura el inmueble, la fachada, letreros y accesos; evita fotografiar personas, rostros, placas de vehículos o el interior de domicilios particulares.",
    "Este teléfono guarda solo las visitas que tienes asignadas y lo que aún no se envía. Al sincronizar o al cerrar sesión se borra. Protege el teléfono con bloqueo de pantalla y avisa de inmediato a tu responsable si lo pierdes.",
    "Cada foto queda con su ubicación, hora y huella digital, y cada acción queda en la bitácora. El mal uso de la información puede dar lugar a responsabilidades administrativas o penales.",
  ],
};

/**
 * Aviso de privacidad simplificado para mostrar a quien atienda en el sitio si lo pide.
 * `{responsable}` se sustituye por el nombre de la organización.
 */
export const AVISO_PRIVACIDAD_SITIO: { titulo: string; parrafos: string[] } = {
  titulo: "Aviso de privacidad simplificado",
  parrafos: [
    "{responsable} realiza esta visita como parte de un procedimiento de fiscalización para verificar la existencia y el domicilio de un proveedor.",
    "Se registran fotografías del inmueble, la ubicación y la hora de la visita. No se recaban datos personales de quien atiende, salvo que voluntariamente confirme información sobre el proveedor.",
    "Los datos se usan solo para ese procedimiento, se resguardan con medidas de seguridad y no se transfieren salvo por mandato de ley. Puedes ejercer tus derechos de acceso, rectificación, cancelación y oposición ante {responsable}.",
  ],
};

export const respuestaCampoSchema = z.enum(["si", "no", "no_verificable"]);

const coordenadas = {
  latitud: z.number().min(-90).max(90).nullable(),
  longitud: z.number().min(-180).max(180).nullable(),
  precision_m: z.number().min(0).max(100000).nullable(),
};

/** Metadatos de una foto ya subida al bucket `campo`. */
export const evidenciaCampoSchema = z.object({
  id: z.uuid(),
  visita_id: z.uuid(),
  ruta: z
    .string()
    .regex(
      /^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.(jpg|jpeg|png|webp|heic)$/,
    ),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  bytes: z.number().int().positive().max(MAX_BYTES_FOTO),
  mime: z.enum(MIMES_FOTO),
  capturada_en: z.iso.datetime({ offset: true }),
  ...coordenadas,
});

export const cedulaCampoSchema = z.object({
  id: z.uuid(),
  visita_id: z.uuid(),
  respuestas: z.record(z.string(), respuestaCampoSchema),
  domicilio_observado: z.string().trim().max(500).nullable(),
  observaciones: z.string().trim().max(4000).nullable(),
  capturada_en: z.iso.datetime({ offset: true }),
  evidencias: z.array(z.uuid()).max(MAX_FOTOS_POR_VISITA),
  ...coordenadas,
});

export type EvidenciaCampo = z.infer<typeof evidenciaCampoSchema>;
export type CedulaCampo = z.infer<typeof cedulaCampoSchema>;

export const extensionDeMime = (mime: string): string =>
  mime === "image/png"
    ? "png"
    : mime === "image/webp"
      ? "webp"
      : mime === "image/heic"
        ? "heic"
        : "jpg";
