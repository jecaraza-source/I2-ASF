import { createHash } from "node:crypto";
import { evidenciaCampoSchema } from "@sigma/modelo";
import { NextResponse, type NextRequest } from "next/server";
import { entradaCampo, SIN_CACHE } from "@/lib/campo-api";
import { mensajeDeError } from "@/lib/errores-db";
import { clienteServidor } from "@/lib/supabase/servidor";

export const maxDuration = 60;

/** Primeros bytes de cada formato admitido: el archivo debe ser la imagen que dice ser. */
function coincideFormato(bytes: Uint8Array, mime: string): boolean {
  const empieza = (firma: number[], desde = 0) => firma.every((b, i) => bytes[desde + i] === b);
  switch (mime) {
    case "image/jpeg":
      return empieza([0xff, 0xd8, 0xff]);
    case "image/png":
      return empieza([0x89, 0x50, 0x4e, 0x47]);
    case "image/webp":
      return empieza([0x52, 0x49, 0x46, 0x46]) && empieza([0x57, 0x45, 0x42, 0x50], 8);
    case "image/heic":
      return empieza([0x66, 0x74, 0x79, 0x70], 4);
    default:
      return false;
  }
}

/**
 * Registra una foto ya subida desde el teléfono al bucket `campo`. El servidor la descarga y vuelve a
 * calcular su SHA-256: si no coincide con el del teléfono, no se registra.
 */
export async function POST(request: NextRequest) {
  const entrada = await entradaCampo(request);
  if ("error" in entrada) return entrada.error;
  const p = evidenciaCampoSchema.safeParse(entrada.cuerpo);
  if (!p.success) {
    return NextResponse.json(
      { error: "Datos de la foto inválidos" },
      { status: 400, headers: SIN_CACHE },
    );
  }
  const supabase = await clienteServidor();
  const { data: archivo, error: errorDescarga } = await supabase.storage
    .from("campo")
    .download(p.data.ruta);
  if (errorDescarga || !archivo) {
    return NextResponse.json(
      { error: "La foto no está en el almacén" },
      { status: 404, headers: SIN_CACHE },
    );
  }
  const bytes = new Uint8Array(await archivo.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== p.data.sha256 || bytes.byteLength !== p.data.bytes) {
    console.error(`[campo] huella distinta en evidencia ${p.data.id}`);
    return NextResponse.json(
      { error: "La foto llegó alterada: su huella no coincide." },
      { status: 422, headers: SIN_CACHE },
    );
  }
  if (!coincideFormato(bytes, p.data.mime)) {
    return NextResponse.json(
      { error: "El archivo no es una imagen válida." },
      { status: 422, headers: SIN_CACHE },
    );
  }
  const { error } = await supabase.rpc("campo_registrar_evidencia", { p: p.data });
  if (error) {
    return NextResponse.json(
      { error: mensajeDeError(error, "campoEvidencia") },
      { status: error.code === "42501" ? 403 : 409, headers: SIN_CACHE },
    );
  }
  return NextResponse.json({ ok: true }, { headers: SIN_CACHE });
}
