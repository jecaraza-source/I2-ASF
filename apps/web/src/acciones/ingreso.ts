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

/**
 * Registra un original ya subido. El servidor vuelve a calcular el SHA-256 sobre lo que quedó en
 * el bucket: si no coincide con la huella declarada, o el contenido no es del tipo que dice ser,
 * el documento se rechaza y queda en bitácora (§4).
 */
export async function registrarDocumento(entrada: unknown): Promise<Registro> {
  const p = registroSchema.safeParse(entrada);
  if (!p.success) return { ok: false, mensaje: p.error.issues[0]?.message ?? "Datos inválidos." };
  const d = p.data;
  const tipo = tipoPorNombre(d.nombre);
  if (!tipo) return { ok: false, mensaje: "Tipo de archivo no aceptado." };
  const c = await contexto(d.encargoId);
  if (!c) return { ok: false, mensaje: "Tu rol no permite ingresar documentos en este encargo." };

  const destino = ruta(c.organizacionId, c.encargoId, d.sha256);
  const descarga = await c.supabase.storage.from(BUCKET).download(destino);
  if (descarga.error || !descarga.data) {
    return { ok: false, mensaje: "El archivo no llegó al almacenamiento. Vuelve a subirlo." };
  }
  const bytes = new Uint8Array(await descarga.data.arrayBuffer());
  const calculado = createHash("sha256").update(bytes).digest("hex");

  const rechazar = async (motivo: string, mensaje: string): Promise<Registro> => {
    const { error } = await c.supabase.from("bitacora").insert({
      organizacion_id: c.organizacionId,
      encargo_id: c.encargoId,
      actor: c.usuarioId,
      accion: "documento.rechazado",
      objeto_tipo: "documento_origen",
      detalle: {
        motivo,
        nombre_archivo: d.nombre,
        sha256_declarado: d.sha256,
        sha256_calculado: calculado,
        tamano: bytes.length,
        tipo_almacenado: descarga.data.type,
      },
    });
    if (error) console.error(`[documentoRechazado] bitácora: ${error.code ?? "desconocido"}`);
    return { ok: false, rechazado: true, mensaje };
  };

  if (calculado !== d.sha256) {
    return rechazar(
      "sha256_no_coincide",
      "Rechazado: la huella calculada en el servidor no coincide con la del navegador.",
    );
  }
  if (bytes.length > MAX_BYTES_DOCUMENTO)
    return rechazar("tamano_excedido", "Rechazado: el archivo supera 50 MB.");
  if (!contenidoCoincide(bytes, tipo) || descarga.data.type.split(";")[0] !== tipo.mime) {
    return rechazar(
      "tipo_no_coincide",
      `Rechazado: el contenido no corresponde a un archivo .${tipo.extension}.`,
    );
  }

  const { data, error } = await c.supabase.rpc("registrar_documento", {
    p: {
      encargo_id: c.encargoId,
      sha256: calculado,
      nombre_archivo: d.nombre,
      mime: tipo.mime,
      tamano: bytes.length,
      tipo_documento_id: d.tipoDocumentoId,
      expediente_id: d.expedienteId,
      expediente_nuevo: d.expedienteId ? null : d.expedienteNuevo,
      fuente: d.fuente,
    } as Json,
  });
  if (error) {
    if (error.code === "23505")
      return { ok: false, duplicado: true, mensaje: "Este archivo ya existe en el encargo." };
    return { ok: false, mensaje: mensajeDeError(error, "registrarDocumento") };
  }
  const r = z
    .object({ documento_id: z.uuid(), registro_id: z.uuid(), trabajo_id: z.uuid() })
    .safeParse(data);
  if (!r.success) return { ok: false, mensaje: "El registro no devolvió un documento." };

  // Se intenta procesar el trabajo de una vez; si no se puede, lo toma el cron.
  try {
    await procesarTrabajos({ trabajoId: r.data.trabajo_id });
  } catch {
    console.error(`[registrarDocumento] el trabajo ${r.data.trabajo_id} queda para el cron`);
  }
  return { ok: true, documentoId: r.data.documento_id, registroId: r.data.registro_id };
}
