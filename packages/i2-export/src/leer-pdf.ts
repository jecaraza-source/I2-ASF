import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFRawStream,
  PDFString,
  PDFHexString,
  decodePDFRawStream,
} from "pdf-lib";

/**
 * Lee el datos.json adjunto a un reporte. Sirve para verificar: SHA-256 de lo que devuelve = hash
 * impreso al pie del reporte.
 */
export async function leerDatosAdjuntos(pdf: Uint8Array): Promise<string | null> {
  const doc = await PDFDocument.load(pdf);
  const nombres = doc.catalog.lookupMaybe(PDFName.of("Names"), PDFDict);
  const embebidos = nombres?.lookupMaybe(PDFName.of("EmbeddedFiles"), PDFDict);
  const lista = embebidos?.lookupMaybe(PDFName.of("Names"), PDFArray);
  if (!lista) return null;
  for (let i = 0; i + 1 < lista.size(); i += 2) {
    const nombre = lista.lookup(i);
    const texto =
      nombre instanceof PDFString || nombre instanceof PDFHexString ? nombre.decodeText() : "";
    if (texto !== "datos.json") continue;
    const spec = lista.lookup(i + 1, PDFDict);
    const ef = spec.lookup(PDFName.of("EF"), PDFDict);
    const flujo = ef.lookup(PDFName.of("F"));
    if (!(flujo instanceof PDFRawStream)) return null;
    return new TextDecoder().decode(decodePDFRawStream(flujo).decode());
  }
  return null;
}
