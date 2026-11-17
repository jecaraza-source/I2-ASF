"use server";

import { createHash } from "node:crypto";
import {
  MAX_BYTES_DOCUMENTO,
  contenidoCoincide,
  esSha256,
  puede,
  tipoPorNombre,
  type Json,
} from "@sigma/modelo";
import { z } from "zod";
import { mensajeDeError } from "@/lib/errores-db";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";
import { procesarTrabajos } from "@/lib/trabajos";

const BUCKET = "originales";
const sha = z.string().refine(esSha256, "Huella inválida");
const ruta = (org: string, encargo: string, sha256: string) => `${org}/${encargo}/${sha256}`;

async function contexto(encargoId: string) {
  const { activa, usuario } = await requerirOrganizacion();
  if (!puede(activa.rol, "documento.ingresar")) return null;
  const supabase = await clienteServidor();
  const { data: encargo } = await supabase
    .from("encargo")
    .select("id")
    .eq("id", encargoId)
    .eq("organizacion_id", activa.organizacionId)
    .maybeSingle();
  return encargo
    ? {
        supabase,
        encargoId: encargo.id,
        organizacionId: activa.organizacionId,
        usuarioId: usuario.id,
      }
    : null;
}

const duplicadosSchema = z.object({ encargoId: z.uuid(), huellas: z.array(sha).min(1).max(50) });

/** Huellas que ya existen como documento del encargo (para avisar antes de subir). */
export async function revisarDuplicados(
  entrada: unknown,
): Promise<{ sha256: string; documentoId: string; nombre: string }[]> {
  const p = duplicadosSchema.safeParse(entrada);
  if (!p.success) return [];
  const c = await contexto(p.data.encargoId);
  if (!c) return [];
  const { data } = await c.supabase
    .from("documento_origen")
    .select("id, sha256, nombre_archivo")
    .eq("encargo_id", c.encargoId)
    .in("sha256", p.data.huellas);
  return (data ?? []).map((d) => ({
    sha256: d.sha256,
    documentoId: d.id,
    nombre: d.nombre_archivo,
  }));
}

const subidaSchema = z.object({
  encargoId: z.uuid(),
  sha256: sha,
  nombre: z.string().trim().min(1).max(255),
  tamano: z.number().int().positive().max(MAX_BYTES_DOCUMENTO),
});

export type Subida =
  { ok: true; ruta: string; token: string | null; mime: string } | { ok: false; mensaje: string };

/**
 * Emite una URL firmada para subir el original directo al bucket, en la ruta
 * {organizacion}/{encargo}/{sha256}. Si el objeto ya está (subida anterior interrumpida),
 * `token` es null y se pasa directo al registro.
 */
export async function prepararSubida(entrada: unknown): Promise<Subida> {
  const p = subidaSchema.safeParse(entrada);
  if (!p.success) return { ok: false, mensaje: "Archivo inválido o mayor a 50 MB." };
  const tipo = tipoPorNombre(p.data.nombre);
  if (!tipo) return { ok: false, mensaje: "Tipo de archivo no aceptado." };
  const c = await contexto(p.data.encargoId);
  if (!c) return { ok: false, mensaje: "Tu rol no permite ingresar documentos en este encargo." };
  const destino = ruta(c.organizacionId, c.encargoId, p.data.sha256);
  const { data, error } = await c.supabase.storage.from(BUCKET).createSignedUploadUrl(destino);
  if (error) {
    if (/exist|duplicate/i.test(error.message))
      return { ok: true, ruta: destino, token: null, mime: tipo.mime };
    console.error(`[prepararSubida] no se pudo firmar la subida del encargo ${c.encargoId}`);
    return { ok: false, mensaje: "No se pudo preparar la subida. Intenta de nuevo." };
  }
  return { ok: true, ruta: destino, token: data.token, mime: tipo.mime };
}

const registroSchema = z
  .object({
    encargoId: z.uuid(),
    sha256: sha,
    nombre: z.string().trim().min(1).max(255),
    tipoDocumentoId: z.uuid("Elige el tipo de documento"),
    expedienteId: z.uuid().nullable(),
    expedienteNuevo: z.string().trim().max(120).nullable(),
    fuente: z.string().trim().min(1, "Escribe la fuente").max(200),
  })
  .refine((d) => d.expedienteId || d.expedienteNuevo, "Elige un expediente o escribe uno nuevo");

export type Registro =
  | { ok: true; documentoId: string; registroId: string }
  | { ok: false; mensaje: string; rechazado?: boolean; duplicado?: boolean };

type Contexto = NonNullable<Awaited<ReturnType<typeof contexto>>>;
type Verificado =
  | { ok: true; sha256: string; mime: string; tamano: number }
  | { ok: false; mensaje: string; rechazado?: boolean };

/**
 * Descarga lo que quedó en el bucket y lo verifica: SHA-256 recalculado en el servidor, tamaño y
 * que el contenido sea del tipo que dice ser. Lo que no pasa se rechaza y queda en bitácora (§4).
 */
async function verificarOriginal(
  c: Contexto,
  declarado: string,
  nombre: string,
): Promise<Verificado> {
  const tipo = tipoPorNombre(nombre);
  if (!tipo) return { ok: false, mensaje: "Tipo de archivo no aceptado." };
  const descarga = await c.supabase.storage
    .from(BUCKET)
    .download(ruta(c.organizacionId, c.encargoId, declarado));
  if (descarga.error || !descarga.data) {
    return { ok: false, mensaje: "El archivo no llegó al almacenamiento. Vuelve a subirlo." };
  }
  const bytes = new Uint8Array(await descarga.data.arrayBuffer());
  const calculado = createHash("sha256").update(bytes).digest("hex");

  const rechazar = async (motivo: string, mensaje: string): Promise<Verificado> => {
    const { error } = await c.supabase.from("bitacora").insert({
      organizacion_id: c.organizacionId,
      encargo_id: c.encargoId,
      actor: c.usuarioId,
      accion: "documento.rechazado",
      objeto_tipo: "documento_origen",
      detalle: {
        motivo,
        nombre_archivo: nombre,
        sha256_declarado: declarado,
        sha256_calculado: calculado,
        tamano: bytes.length,
        tipo_almacenado: descarga.data.type,
      },
    });
    if (error) console.error(`[documentoRechazado] bitácora: ${error.code ?? "desconocido"}`);
    return { ok: false, rechazado: true, mensaje };
  };

  if (calculado !== declarado) {
    return rechazar(
      "sha256_no_coincide",
      "Rechazado: la huella calculada en el servidor no coincide con la del navegador.",
    );
  }
  if (bytes.length > MAX_BYTES_DOCUMENTO) {
    return rechazar("tamano_excedido", "Rechazado: el archivo supera 50 MB.");
  }
  if (!contenidoCoincide(bytes, tipo) || descarga.data.type.split(";")[0] !== tipo.mime) {
    return rechazar(
      "tipo_no_coincide",
      `Rechazado: el contenido no corresponde a un archivo .${tipo.extension}.`,
    );
  }
  return { ok: true, sha256: calculado, mime: tipo.mime, tamano: bytes.length };
}

const resultadoRpc = z.object({
  documento_id: z.uuid(),
  registro_id: z.uuid(),
  trabajo_id: z.uuid(),
});

/** Se intenta procesar el trabajo de una vez; si no se puede, lo toma el cron. */
async function procesarAhora(trabajoId: string, origen: string) {
  try {
    await procesarTrabajos({ trabajoId });
  } catch {
    console.error(`[${origen}] el trabajo ${trabajoId} queda para el cron`);
  }
}

/**
 * Registra un original ya subido. El servidor vuelve a calcular el SHA-256 sobre lo que quedó en
 * el bucket: si no coincide con la huella declarada, o el contenido no es del tipo que dice ser,
 * el documento se rechaza y queda en bitácora (§4).
 */
export async function registrarDocumento(entrada: unknown): Promise<Registro> {
  const p = registroSchema.safeParse(entrada);
  if (!p.success) return { ok: false, mensaje: p.error.issues[0]?.message ?? "Datos inválidos." };
  const d = p.data;
  const c = await contexto(d.encargoId);
  if (!c) return { ok: false, mensaje: "Tu rol no permite ingresar documentos en este encargo." };
  const v = await verificarOriginal(c, d.sha256, d.nombre);
  if (!v.ok) return v;

  const { data, error } = await c.supabase.rpc("registrar_documento", {
    p: {
      encargo_id: c.encargoId,
      sha256: v.sha256,
      nombre_archivo: d.nombre,
      mime: v.mime,
      tamano: v.tamano,
      tipo_documento_id: d.tipoDocumentoId,
      expediente_id: d.expedienteId,
      expediente_nuevo: d.expedienteId ? null : d.expedienteNuevo,
      fuente: d.fuente,
    } as Json,
  });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, duplicado: true, mensaje: "Este archivo ya existe en el encargo." };
    }
    return { ok: false, mensaje: mensajeDeError(error, "registrarDocumento") };
  }
  const r = resultadoRpc.safeParse(data);
  if (!r.success) return { ok: false, mensaje: "El registro no devolvió un documento." };
  await procesarAhora(r.data.trabajo_id, "registrarDocumento");
  return { ok: true, documentoId: r.data.documento_id, registroId: r.data.registro_id };
}

const asociarSchema = z.object({
  encargoId: z.uuid(),
  registroId: z.uuid(),
  sha256: sha,
  nombre: z.string().trim().min(1).max(255),
});

/** Liga un original ya subido a una captura «sin soporte documental» y encola su extracción. */
export async function asociarDocumento(entrada: unknown): Promise<Registro> {
  const p = asociarSchema.safeParse(entrada);
  if (!p.success) return { ok: false, mensaje: "Datos inválidos." };
  const d = p.data;
  const c = await contexto(d.encargoId);
  if (!c) return { ok: false, mensaje: "Tu rol no permite asociar documentos en este encargo." };
  const v = await verificarOriginal(c, d.sha256, d.nombre);
  if (!v.ok) return v;

  const { data, error } = await c.supabase.rpc("asociar_documento", {
    p: {
      registro_id: d.registroId,
      sha256: v.sha256,
      nombre_archivo: d.nombre,
      mime: v.mime,
      tamano: v.tamano,
    } as Json,
  });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, duplicado: true, mensaje: "Este archivo ya existe en el encargo." };
    }
    if (error.code === "22023")
      return { ok: false, mensaje: "El registro ya tiene un documento asociado." };
    return { ok: false, mensaje: mensajeDeError(error, "asociarDocumento") };
  }
  const r = resultadoRpc.safeParse(data);
  if (!r.success) return { ok: false, mensaje: "La asociación no devolvió un documento." };
  await procesarAhora(r.data.trabajo_id, "asociarDocumento");
  return { ok: true, documentoId: r.data.documento_id, registroId: r.data.registro_id };
}
