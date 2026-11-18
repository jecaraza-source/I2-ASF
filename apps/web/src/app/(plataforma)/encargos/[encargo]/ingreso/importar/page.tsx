import { MOTIVO_BLOQUEO_IA, NOMBRE_PROVEEDOR_IA, puede, textoErrorIA } from "@sigma/modelo";
import Link from "next/link";
import { z } from "zod";
import { reencolarExtraccion } from "@/acciones/ingreso";
import { EstadoVacio } from "@/components/estados";
import { ZonaIngreso } from "@/components/ingreso/zona";
import { Etiqueta, Panel, Titulo } from "@/components/ui";
import { formatoFecha, obtenerEncargo } from "@/lib/datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

const EXTRACCION: Record<string, string> = {
  en_cola: "En cola",
  en_espera: "En espera de extracción",
  en_proceso: "Extrayendo",
  hecha: "Extraído",
  error: "Extracción con error",
  no_aplica: "—",
};
/** Texto para la nota de extracción: motivo de espera, proveedor que leyó o código del error. */
function notaDe(estado: string, nota: string | null): string {
  if (!nota) return "";
  if (estado === "hecha") {
    return nota === "anthropic" || nota === "openai"
      ? ` · leído con ${NOMBRE_PROVEEDOR_IA[nota]}`
      : "";
  }
  if (estado === "error") return ` · ${textoErrorIA(nota)}`;
  return MOTIVO_BLOQUEO_IA[nota] ? ` · ${MOTIVO_BLOQUEO_IA[nota]}` : "";
}

const MOTIVO: Record<string, string> = {
  sha256_no_coincide: "La huella del servidor no coincide con la del navegador",
  tipo_no_coincide: "El contenido no corresponde al tipo de archivo",
  tamano_excedido: "Supera el tamaño permitido",
};
const rechazoSchema = z
  .object({ motivo: z.string(), nombre_archivo: z.string(), sha256_declarado: z.string() })
  .partial()
  .catch({});

/** Las acciones de esta página procesan el documento después de responder (lectura con IA). */
export const maxDuration = 300;

export default async function IngresoDocumentos({
  params,
}: {
  params: Promise<{ encargo: string }>;
}) {
  const { encargo: id } = await params;
  const encargo = await obtenerEncargo(id);
  const { activa } = await requerirOrganizacion();
  const supabase = await clienteServidor();
  const [{ data: tipos }, { data: expedientes }, { data: registros }, { data: rechazos }] =
    await Promise.all([
      supabase
        .from("tipo_documento")
        .select("id, nombre, categoria_documental(nombre)")
        .eq("organizacion_id", activa.organizacionId)
        .order("nombre"),
      supabase
        .from("expediente")
        .select("id, identificador")
        .eq("encargo_id", encargo.id)
        .order("identificador"),
      supabase
        .from("registro")
        .select(
          "id, estado_validacion, estado_extraccion, extraccion_nota, fuente, creado_en, documento_origen(id, nombre_archivo), tipo_documento(nombre), expediente(identificador)",
        )
        .eq("encargo_id", encargo.id)
        .eq("origen", "documento")
        .order("creado_en", { ascending: false })
        .limit(100),
      supabase
        .from("bitacora")
        .select("id, en, detalle")
        .eq("encargo_id", encargo.id)
        .eq("accion", "documento.rechazado")
        .order("en", { ascending: false })
        .limit(10),
    ]);

  const grupos = new Map<string, { id: string; nombre: string }[]>();
  for (const t of tipos ?? []) {
    const categoria = t.categoria_documental?.nombre ?? "Otros";
    grupos.set(categoria, [...(grupos.get(categoria) ?? []), { id: t.id, nombre: t.nombre }]);
  }
  const puedeIngresar = puede(activa.rol, "documento.ingresar");
  const base = `/encargos/${encargo.id}`;

  return (
    <main className="flex-1 px-8 py-8">
      <Titulo>Ingreso de documentos</Titulo>
      <div className="flex max-w-6xl flex-col gap-8">
        {!puedeIngresar ? (
          <Panel>
            <p className="text-sm text-tenue">
              Tu rol permite consultar los documentos, no ingresarlos.
            </p>
          </Panel>
        ) : grupos.size === 0 ? (
          <EstadoVacio
            titulo="Falta el catálogo de tipos de documento."
            descripcion="Un administrador lo define en Configuración antes de ingresar documentos."
          />
        ) : (
          <ZonaIngreso
            encargoId={encargo.id}
            tipos={[...grupos.entries()].map(([categoria, tipos]) => ({ categoria, tipos }))}
            expedientes={(expedientes ?? []).map((x) => ({ id: x.id, nombre: x.identificador }))}
          />
        )}

        <section
          aria-label="Documentos ingresados"
          className="overflow-x-auto rounded-lg border border-linea"
        >
          <table className="w-full text-left text-sm">
            <caption className="px-4 py-2 text-left text-sm font-semibold text-texto">
              Documentos ingresados ({(registros ?? []).length})
            </caption>
            <thead className="bg-panel-2 text-xs tracking-wide text-tenue uppercase">
              <tr>
                <th scope="col" className="px-4 py-2">
                  Documento
                </th>
                <th scope="col" className="px-4 py-2">
                  Tipo
                </th>
                <th scope="col" className="px-4 py-2">
                  Expediente
                </th>
                <th scope="col" className="px-4 py-2">
                  Fuente
                </th>
                <th scope="col" className="px-4 py-2">
                  Registro
                </th>
                <th scope="col" className="px-4 py-2">
                  Recibido
                </th>
              </tr>
            </thead>
            <tbody>
              {(registros ?? []).map((r) => (
                <tr key={r.id} className="border-t border-linea align-top">
                  <td className="px-4 py-2">
                    {r.documento_origen ? (
                      <Link
                        href={`${base}/documentos/${r.documento_origen.id}`}
                        className="text-azul-claro hover:underline"
                      >
                        {r.documento_origen.nombre_archivo}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-2 text-texto">{r.tipo_documento?.nombre ?? "—"}</td>
                  <td className="px-4 py-2 text-texto">{r.expediente?.identificador ?? "—"}</td>
                  <td className="px-4 py-2 text-tenue">{r.fuente ?? "—"}</td>
                  <td className="px-4 py-2">
                    <Etiqueta tono={r.estado_validacion === "validado" ? "ok" : "neutro"}>
                      {r.estado_validacion === "pendiente" ? "Pendiente" : r.estado_validacion}
                    </Etiqueta>
                    <span className="ml-2 text-xs text-tenue">
                      {EXTRACCION[r.estado_extraccion] ?? r.estado_extraccion}
                      {notaDe(r.estado_extraccion, r.extraccion_nota)}
                    </span>
                    {puedeIngresar &&
                    (r.estado_extraccion === "en_espera" || r.estado_extraccion === "error") ? (
                      <form action={reencolarExtraccion} className="mt-1">
                        <input type="hidden" name="encargo_id" value={encargo.id} />
                        <input type="hidden" name="registro_id" value={r.id} />
                        <button
                          type="submit"
                          className="text-xs text-azul-claro hover:underline"
                          aria-label={`Reintentar lectura de ${r.documento_origen?.nombre_archivo ?? "documento"}`}
                        >
                          Reintentar lectura
                        </button>
                      </form>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-tenue">{formatoFecha(r.creado_en)}</td>
                </tr>
              ))}
              {(registros ?? []).length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-tenue">
                    Aún no hay documentos ingresados en este encargo.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>

        {(rechazos ?? []).length ? (
          <section
            aria-label="Documentos rechazados"
            className="rounded-lg border border-linea bg-panel p-4"
          >
            <h2 className="mb-2 text-sm font-semibold text-texto">Rechazados (en bitácora)</h2>
            <ul className="flex flex-col gap-1 text-xs text-tenue">
              {(rechazos ?? []).map((b) => {
                const d = rechazoSchema.parse(b.detalle);
                return (
                  <li key={b.id}>
                    {formatoFecha(b.en)} ·{" "}
                    <span className="text-texto">{d.nombre_archivo ?? "Archivo"}</span> ·{" "}
                    {MOTIVO[d.motivo ?? ""] ?? "Rechazado"}
                    {d.sha256_declarado ? (
                      <span className="font-mono"> · {d.sha256_declarado.slice(0, 12)}…</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}
      </div>
    </main>
  );
}
