/** Tipos de archivo que acepta el ingreso de documentos (§6) y cómo reconocerlos. */

export const MAX_BYTES_DOCUMENTO = 50 * 1024 * 1024;

export type TipoArchivo = {
  extension: string;
  mime: string;
  clase: "pdf" | "imagen" | "excel" | "correo";
  /** Se puede mostrar dentro de la página (PDF e imágenes rasterizadas); lo demás solo se descarga. */
  vista_previa: boolean;
};

export const TIPOS_ARCHIVO: readonly TipoArchivo[] = [
  { extension: "pdf", mime: "application/pdf", clase: "pdf", vista_previa: true },
  { extension: "png", mime: "image/png", clase: "imagen", vista_previa: true },
  { extension: "jpg", mime: "image/jpeg", clase: "imagen", vista_previa: true },
  { extension: "jpeg", mime: "image/jpeg", clase: "imagen", vista_previa: true },
  { extension: "webp", mime: "image/webp", clase: "imagen", vista_previa: true },
  { extension: "tif", mime: "image/tiff", clase: "imagen", vista_previa: false },
  { extension: "tiff", mime: "image/tiff", clase: "imagen", vista_previa: false },
  {
    extension: "xlsx",
    mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    clase: "excel",
    vista_previa: false,
  },
  { extension: "xls", mime: "application/vnd.ms-excel", clase: "excel", vista_previa: false },
  { extension: "eml", mime: "message/rfc822", clase: "correo", vista_previa: false },
  { extension: "msg", mime: "application/vnd.ms-outlook", clase: "correo", vista_previa: false },
];

export const EXTENSIONES_ACEPTADAS = TIPOS_ARCHIVO.map((t) => `.${t.extension}`).join(",");

/** Tipo según la extensión del nombre; null si no se acepta. */
export function tipoPorNombre(nombre: string): TipoArchivo | null {
  const extension = /\.([a-z0-9]+)$/i.exec(nombre.trim())?.[1]?.toLowerCase();
  return TIPOS_ARCHIVO.find((t) => t.extension === extension) ?? null;
}

export function tipoPorMime(mime: string | null | undefined): TipoArchivo | null {
  return TIPOS_ARCHIVO.find((t) => t.mime === mime) ?? null;
}

const empieza = (b: Uint8Array, firma: number[], desde = 0) =>
  firma.every((v, i) => b[desde + i] === v);

const OLE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/**
 * ¿El contenido corresponde a la extensión? Se revisan los primeros bytes (el archivo es hostil:
 * la extensión y el tipo que declara el navegador no bastan).
 */
export function contenidoCoincide(bytes: Uint8Array, tipo: TipoArchivo): boolean {
  switch (tipo.extension) {
    case "pdf":
      return empieza(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d]); // %PDF-
    case "png":
      return empieza(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "jpg":
    case "jpeg":
      return empieza(bytes, [0xff, 0xd8, 0xff]);
    case "webp":
      return (
        empieza(bytes, [0x52, 0x49, 0x46, 0x46]) && empieza(bytes, [0x57, 0x45, 0x42, 0x50], 8)
      );
    case "tif":
    case "tiff":
      return empieza(bytes, [0x49, 0x49, 0x2a, 0x00]) || empieza(bytes, [0x4d, 0x4d, 0x00, 0x2a]);
    case "xlsx":
      return empieza(bytes, [0x50, 0x4b, 0x03, 0x04]); // ZIP
    case "xls":
    case "msg":
      return empieza(bytes, OLE);
    case "eml": {
      // Texto con encabezados de correo al inicio.
      const inicio = new TextDecoder("latin1").decode(bytes.subarray(0, 2048));
      return !bytes.subarray(0, 2048).includes(0) && /^[A-Za-z-]+:\s/.test(inicio);
    }
    default:
      return false;
  }
}

const SHA256 = /^[0-9a-f]{64}$/;
export const esSha256 = (v: unknown): v is string => typeof v === "string" && SHA256.test(v);
