import { aCsv, leerFiltrosDocumental, NOMBRE_ORIGEN, puede, type Json } from "@sigma/modelo";
import { z } from "zod";
import { leerRegistros, type FilaDocumental } from "@/lib/documental-datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

/** Tope por exportación. Más que esto se acota con filtros. */
const MAX_FILAS = 10_000;
const LOTE = 500;

const ENCABEZADOS = [
  "Registro",
  "Folio",
  "Expediente",
  "Tipo de documento",
  "Categoría",
  "Origen",
  "Fecha",
  "Involucrados",
  "RFC y CURP",
  "Referencias",
  "Montos",
  "Fuente",
  "Archivo",
  "SHA-256",
  "Hoja",
  "Fila",
  "Validación",
  "Calificación",
  "Alertas abiertas",
  "ID del registro",
] as const;

const fecha = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

function aFila(f: FilaDocumental): unknown[] {
  return [
    f.resumen ?? "",
    `R-${f.registro_id.slice(0, 8).toUpperCase()}`,
    f.expediente ?? "Sin expediente",
    f.tipo ?? (f.hoja ? "Hoja de Excel" : ""),
    f.categoria ?? "",
    NOMBRE_ORIGEN[f.origen as keyof typeof NOMBRE_ORIGEN] ?? f.origen,
    fecha(f.fecha),
    f.involucrados.map((i) => `${i.nombre} (${i.rol})`).join("; "),
    f.identificadores.map((x) => `${x.tipo.toUpperCase()} ${x.valor}`).join("; "),
    f.referencias.join("; "),
    f.montos.map((m) => `${m.monto} ${m.moneda}`).join("; "),
    f.fuente ?? "",
    f.archivo ?? "",
    f.sha256 ?? "",
    f.hoja ?? "",
    f.fila ?? "",
    f.estado_validacion,
    f.nivel ?? "sin calificar",
    f.alertas,
    f.registro_id,
  ];
}

/**
 * Exporta la vista actual del expediente documental (los mismos filtros de la URL) a CSV. Solo
 * admin y auditor. Queda en bitácora quién exportó, qué filtros y cuántas filas; si la bitácora no
 * se puede escribir, no se entrega el archivo (regla 3).
 */
export async function GET(peticion: Request, { params }: { params: Promise<{ encargo: string }> }) {
  const { encargo: encargoId } = await params;
  if (!z.uuid().safeParse(encargoId).success) return new Response("No encontrado", { status: 404 });
  const { activa, usuario } = await requerirOrganizacion();
  if (!puede(activa.rol, "registro.exportar")) {
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

  const filtros = leerFiltrosDocumental(
    Object.fromEntries(new URL(peticion.url).searchParams.entries()),
  );
  const filas: FilaDocumental[] = [];
  let total = 0;
  for (let desplazamiento = 0; desplazamiento < MAX_FILAS; desplazamiento += LOTE) {
    const r = await leerRegistros(supabase, encargo.id, filtros, { limite: LOTE, desplazamiento });
    if (!r.ok) return new Response("No se pudieron leer los registros.", { status: 500 });
    total = r.total;
    filas.push(...r.filas);
    if (r.filas.length < LOTE) break;
  }

  // Solo IDs y el tipo de filtro: el texto buscado puede contener nombres (regla 7).
  const { error } = await supabase.from("bitacora").insert({
    organizacion_id: encargo.organizacion_id,
    encargo_id: encargo.id,
    actor: usuario.id,
    accion: "registro.exportacion",
    objeto_tipo: "encargo",
    objeto_id: encargo.id,
    detalle: {
      formato: "csv",
      vista: filtros.vista,
      expediente: filtros.vista === "entidad" ? null : (filtros.expediente ?? null),
      entidad: filtros.entidad ?? null,
      categoria: filtros.categoria ?? null,
      estado: filtros.estado ?? null,
      origen: filtros.origen ?? null,
      desde: filtros.desde ?? null,
      hasta: filtros.hasta ?? null,
      con_busqueda: Boolean(filtros.q),
      filas: filas.length,
      total,
    } satisfies Json,
  });
  if (error) {
    console.error(`[exportarRegistros] bitácora: ${error.code ?? "desconocido"}`);
    return new Response("No se pudo registrar la exportación en bitácora.", { status: 500 });
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const nombre = `registros-${hoy}.csv`;
  return new Response(aCsv(ENCABEZADOS, filas.map(aFila)), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${nombre}"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
