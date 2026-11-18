import { puede, formatoMonto, formatoNumero, formatoPorcentaje } from "@sigma/modelo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AsociarDocumento } from "@/components/captura/asociar-documento";
import { NOMBRE_TIPO } from "@/components/red/presentacion";
import { Etiqueta, Panel, Titulo } from "@/components/ui";
import { formatoFecha, obtenerEncargo } from "@/lib/datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";
import { cargarGenerado, cargarRegistro } from "@/lib/vista-datos";

const ORIGEN: Record<string, string> = {
  documento: "Documento",
  captura: "Captura manual",
  importacion: "Importación de Excel",
  campo: "Verificación en campo",
};

const fechaHora = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Nombre legible de las acciones de la bitácora que tocan un registro o su documento. */
const ACCION: Record<string, string> = {
  "documento_origen.alta": "Ingreso del documento",
  "documento.consulta": "Consulta del original",
  "registro.alta": "Alta del registro",
  "registro.cambio": "Cambio en el registro",
  "extraccion.ia": "Lectura con IA",
  "extraccion.validacion": "Validación de un dato",
  "registro.validacion": "Validación",
  "registro.rechazo": "Rechazo",
  "registro.exportacion": "Exportación",
};

const ES_MONTO = /monto|importe|total|pagado|saldo/i;

/** Valor normalizado para mostrar: montos con su moneda y números con miles. */
function valor(campo: string, v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object" && !Array.isArray(v) && "monto" in v) {
    const m = v as { monto: unknown; moneda?: unknown };
    if (typeof m.monto === "string" || typeof m.monto === "number") {
      return formatoMonto(m.monto, typeof m.moneda === "string" ? m.moneda : null);
    }
  }
  if (typeof v === "object") return JSON.stringify(v);
  if (ES_MONTO.test(campo) && /^-?\d+(\.\d+)?$/.test(String(v))) return formatoMonto(String(v));
  if (typeof v === "number") return formatoNumero(v);
  return String(v);
}

/** Las acciones de esta página procesan el documento después de responder (lectura con IA). */
export const maxDuration = 300;

export default async function Registro({
  params,
}: {
  params: Promise<{ encargo: string; id: string }>;
}) {
  const { encargo: encargoId, id } = await params;
  const encargo = await obtenerEncargo(encargoId);
  const supabase = await clienteServidor();
  const datos = await cargarRegistro(supabase, encargo.id, id);
  if (!datos) notFound();
  const generado = await cargarGenerado(supabase, encargo.id, datos.registro.id);
  const { registro: r, extracciones, entidades } = datos;
  const base = `/encargos/${encargo.id}`;
  const { activa } = await requerirOrganizacion();
  const sinSoporte = r.origen === "captura" && !r.documento_origen;

  return (
    <main className="flex-1 px-8 py-8">
      <Titulo>{r.resumen ?? "Registro"}</Titulo>
      <div className="flex max-w-5xl flex-col gap-6">
        <Panel>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-tenue">Origen</dt>
            <dd className="flex flex-wrap items-center gap-2 text-texto">
              {ORIGEN[r.origen] ?? r.origen}
              {sinSoporte ? <Etiqueta tono="oro">Sin soporte documental</Etiqueta> : null}
            </dd>
            <dt className="text-tenue">Documento</dt>
            <dd className="text-texto">
              {r.documento_origen ? (
                <Link
                  href={`${base}/${r.origen === "importacion" ? "importaciones" : "documentos"}/${r.documento_origen.id}`}
                  className="text-azul-claro hover:underline"
                >
                  {r.documento_origen.nombre_archivo}
                </Link>
              ) : (
                "—"
              )}
            </dd>
            <dt className="text-tenue">Expediente</dt>
            <dd className="text-texto">
              {r.expediente_id ? (
                <Link
                  href={`${base}/expedientes/${r.expediente_id}`}
                  className="text-azul-claro hover:underline"
                >
                  {r.expediente?.identificador ?? "Ver expediente"}
                </Link>
              ) : (
                "Sin expediente"
              )}
            </dd>
            <dt className="text-tenue">Fuente</dt>
            <dd className="text-texto">{r.fuente ?? "—"}</dd>
            <dt className="text-tenue">Fecha del documento</dt>
            <dd className="text-texto">{formatoFecha(r.fecha_documento)}</dd>
            <dt className="text-tenue">Validación</dt>
            <dd>
              <Etiqueta tono={r.estado_validacion === "validado" ? "ok" : "neutro"}>
                {r.estado_validacion}
              </Etiqueta>
            </dd>
          </dl>
        </Panel>

        {sinSoporte && puede(activa.rol, "documento.ingresar") ? (
          <Panel>
            <h2 className="mb-3 text-base font-semibold text-texto">Soporte documental</h2>
            <AsociarDocumento encargoId={encargo.id} registroId={r.id} />
          </Panel>
        ) : null}

        <section
          className="overflow-x-auto rounded-lg border border-linea"
          aria-label="Datos de origen"
        >
          <table className="w-full text-left text-sm">
            <caption className="px-4 py-2 text-left text-sm font-semibold text-texto">
              Datos y ubicación de origen
            </caption>
            <thead className="bg-panel-2 text-xs tracking-wide text-tenue uppercase">
              <tr>
                <th scope="col" className="px-4 py-2">
                  Campo
                </th>
                <th scope="col" className="px-4 py-2">
                  Valor en la fuente
                </th>
                <th scope="col" className="px-4 py-2">
                  Normalizado
                </th>
                <th scope="col" className="px-4 py-2">
                  Ubicación
                </th>
                <th scope="col" className="px-4 py-2">
                  Método
                </th>
              </tr>
            </thead>
            <tbody>
              {extracciones.map((x) => (
                <tr
                  key={x.id}
                  id={`x-${x.id}`}
                  className="border-t border-linea align-top target:bg-oro/10"
                >
                  <td className="px-4 py-2 text-texto">{x.campo}</td>
                  <td className="px-4 py-2 text-texto">
                    {x.valor_crudo ?? "—"}
                    {x.valor_ia !== null ? (
                      <span className="block text-xs text-tenue">La IA leyó «{x.valor_ia}»</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-tenue">{valor(x.campo, x.valor_normalizado)}</td>
                  <td className="px-4 py-2 font-mono text-xs text-tenue">
                    {x.metodo === "manual" ? "Captura manual" : x.ubicacion_texto}
                  </td>
                  <td className="px-4 py-2 text-xs text-tenue">
                    {x.metodo}
                    {x.confianza !== null ? ` · ${formatoPorcentaje(x.confianza)}` : ""} ·{" "}
                    {x.estado}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <Panel>
          <h2 className="mb-3 text-base font-semibold text-texto">Entidades mencionadas</h2>
          <ul className="flex flex-col gap-1 text-sm">
            {entidades.map((e) => (
              <li key={`${e.id}-${e.rol}`}>
                <Link
                  href={`${base}/entidades/${e.id}`}
                  className="text-azul-claro hover:underline"
                >
                  {e.nombre}
                </Link>{" "}
                <span className="text-xs text-tenue">
                  {NOMBRE_TIPO[e.tipo] ?? e.tipo} · {e.rol}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel>
          <h2 className="mb-3 text-base font-semibold text-texto">Lo que generó</h2>
          {!generado.vinculos.length && !generado.eventos.length ? (
            <p className="text-sm text-tenue">
              {r.estado_validacion === "pendiente"
                ? "Nada todavía: un registro pendiente no genera vínculos ni eventos hasta validarse."
                : "Este registro no generó vínculos ni eventos."}
            </p>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              <section aria-label="Vínculos generados">
                <h3 className="mb-2 text-xs tracking-wide text-oro uppercase">
                  Vínculos · {formatoNumero(generado.vinculos.length)}
                </h3>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {generado.vinculos.map((v) => (
                    <li key={v.id}>
                      <Link
                        href={`${base}/entidades/${v.origen_id}`}
                        className="text-azul-claro hover:underline"
                      >
                        {v.origen}
                      </Link>{" "}
                      <span className="text-tenue">{v.dirigido ? "→" : "↔"}</span>{" "}
                      <Link
                        href={`${base}/entidades/${v.destino_id}`}
                        className="text-azul-claro hover:underline"
                      >
                        {v.destino}
                      </Link>
                      <span className="block text-xs text-tenue">
                        {v.tipo}
                        {v.fuerza ? ` · fuerza ${v.fuerza}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
              <section aria-label="Eventos generados">
                <h3 className="mb-2 text-xs tracking-wide text-oro uppercase">
                  Eventos · {formatoNumero(generado.eventos.length)}
                </h3>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {generado.eventos.map((ev) => (
                    <li key={ev.id}>
                      <span className="text-texto">
                        {ev.tipo}
                        {ev.fecha ? ` · ${formatoFecha(ev.fecha)}` : ""}
                        {ev.monto !== null ? ` · ${formatoMonto(ev.monto, ev.moneda)}` : ""}
                      </span>
                      <span className="block text-xs text-tenue">
                        {ev.participantes.map((p) => `${p.nombre} (${p.rol})`).join(" · ") ||
                          "Sin participantes"}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>
          )}
        </Panel>

        <section
          aria-label="Bitácora del registro"
          className="rounded-lg border border-linea bg-panel p-4"
        >
          <h2 className="mb-3 text-base font-semibold text-texto">Bitácora</h2>
          {!generado.bitacora.length ? (
            <p className="text-sm text-tenue">Sin movimientos registrados.</p>
          ) : (
            <ol className="flex flex-col gap-1.5 text-sm">
              {generado.bitacora.map((b, i) => (
                <li key={`${b.en}-${i}`} className="flex flex-wrap gap-x-3">
                  <span className="font-mono text-xs text-tenue">
                    {fechaHora.format(new Date(b.en))}
                  </span>
                  <span className="text-texto">{ACCION[b.accion] ?? b.accion}</span>
                  <span className="text-tenue">{b.actor_correo ?? "Sistema"}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </main>
  );
}
