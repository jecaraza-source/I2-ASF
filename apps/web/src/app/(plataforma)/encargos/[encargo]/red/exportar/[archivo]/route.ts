import {
  datosCanonicos,
  entidadesCsv,
  especificacionImportacion,
  eventosCsv,
  graphml,
  reportePdf,
  sha256Hex,
  vinculosCsv,
  type RedExport,
} from "@sigma/i2-export";
import { puede, type Json } from "@sigma/modelo";
import { z } from "zod";
import { cargarRedExportable } from "@/lib/exportacion-datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

/** El reporte PDF de una red grande tarda unos segundos. */
export const maxDuration = 60;

const ARCHIVOS = {
  "entidades.csv": "text/csv; charset=utf-8",
  "vinculos.csv": "text/csv; charset=utf-8",
  "eventos.csv": "text/csv; charset=utf-8",
  "especificacion-i2.txt": "text/plain; charset=utf-8",
  "red.graphml": "application/graphml+xml; charset=utf-8",
  "reporte.pdf": "application/pdf",
} as const;
type Archivo = keyof typeof ARCHIVOS;
const archivoSchema = z.enum(Object.keys(ARCHIVOS) as [Archivo, ...Archivo[]]);

const fechaHora = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const filasCsv = (csv: string) => Math.max(0, csv.replace(/\r\n$/, "").split("\r\n").length - 1);

/** Arma el archivo pedido. Devuelve los bytes y el SHA-256 de los datos que contiene. */
async function construir(
  archivo: Archivo,
  red: RedExport,
  meta: { folio: string; fecha: string; autor: string; organizacion: string },
): Promise<{ cuerpo: Uint8Array; sha256: string }> {
  const texto = async (t: string) => {
    const cuerpo = new TextEncoder().encode(t);
    return { cuerpo, sha256: await sha256Hex(cuerpo) };
  };
  switch (archivo) {
    case "entidades.csv":
      return texto(entidadesCsv(red));
    case "vinculos.csv":
      return texto(vinculosCsv(red));
    case "eventos.csv":
      return texto(eventosCsv(red));
    case "red.graphml":
      return texto(graphml(red));
    case "especificacion-i2.txt": {
      const csvs = [
        ["entidades.csv", entidadesCsv(red)],
        ["vinculos.csv", vinculosCsv(red)],
        ["eventos.csv", eventosCsv(red)],
      ] as const;
      const firmados = await Promise.all(
        csvs.map(async ([nombre, csv]) => ({
          nombre,
          sha256: await sha256Hex(csv),
          filas: filasCsv(csv),
        })),
      );
      return texto(especificacionImportacion(red, firmados, meta));
    }
    case "reporte.pdf": {
      // El hash del pie es el de los datos (adjuntos al PDF como datos.json), no el del PDF.
      const datos = datosCanonicos(red);
      const sha256 = await sha256Hex(datos);
      const cuerpo = await reportePdf(red, { ...meta, sha256, datos, creado: new Date() });
      return { cuerpo, sha256 };
    }
  }
}

/**
 * Exportaciones de la red más reciente: CSV para i2 Analyst's Notebook con su especificación,
 * GraphML y reporte PDF. `?expediente=<id>` acota a lo que toca a un expediente. Solo admin y
 * auditor; cada exportación queda en bitácora con su folio y SHA-256, y sin bitácora no hay archivo.
 */
export async function GET(
  peticion: Request,
  { params }: { params: Promise<{ encargo: string; archivo: string }> },
) {
  const { encargo: encargoId, archivo: crudo } = await params;
  const archivo = archivoSchema.safeParse(crudo);
  const expediente = new URL(peticion.url).searchParams.get("expediente");
  if (
    !z.uuid().safeParse(encargoId).success ||
    !archivo.success ||
    (expediente !== null && !z.uuid().safeParse(expediente).success)
  ) {
    return new Response("No encontrado", { status: 404 });
  }
  const { activa, usuario } = await requerirOrganizacion();
  if (!puede(activa.rol, "red.exportar")) {
    return new Response("Tu rol no permite exportar.", { status: 403 });
  }
  const supabase = await clienteServidor();
  const { data: encargo } = await supabase
    .from("encargo")
    .select("id, organizacion_id, nombre")
    .eq("id", encargoId)
    .eq("organizacion_id", activa.organizacionId)
    .maybeSingle();
  if (!encargo) return new Response("No encontrado", { status: 404 });

  const red = await cargarRedExportable(supabase, encargo, expediente ?? undefined);
  if (!red) {
    return new Response("No hay una red generada que exportar.", { status: 404 });
  }

  const base = red.alcance.tipo === "expediente" ? red.alcance.identificador : "RED";
  const folio = `${base}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const meta = {
    folio,
    fecha: fechaHora.format(new Date()),
    autor: usuario.email ?? usuario.id,
    organizacion: activa.nombre,
  };
  const { cuerpo, sha256 } = await construir(archivo.data, red, meta);

  // Solo IDs, conteos y hash: nada de nombres ni montos (regla 7).
  const { error } = await supabase.from("bitacora").insert({
    organizacion_id: encargo.organizacion_id,
    encargo_id: encargo.id,
    actor: usuario.id,
    accion: "red.exportacion",
    objeto_tipo: "red_generada",
    objeto_id: red.red.id,
    detalle: {
      archivo: archivo.data,
      folio,
      expediente_id: red.alcance.tipo === "expediente" ? red.alcance.id : null,
      entidades: red.entidades.length,
      vinculos: red.vinculos.length,
      eventos: red.eventos.length,
      alertas: red.alertas.length,
      sha256,
    } satisfies Json,
  });
  if (error) {
    console.error(`[exportarRed] bitácora: ${error.code ?? "desconocido"}`);
    return new Response("No se pudo registrar la exportación en bitácora.", { status: 500 });
  }

  const nombre = `${folio}-${archivo.data}`.replace(/[^A-Za-z0-9._-]/g, "_");
  return new Response(new Blob([cuerpo.slice().buffer]), {
    headers: {
      "Content-Type": ARCHIVOS[archivo.data],
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Sigma-Folio": folio,
      "X-Sigma-Sha256": sha256,
    },
  });
}
