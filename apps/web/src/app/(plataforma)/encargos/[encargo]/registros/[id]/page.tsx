import { puede } from "@sigma/modelo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AsociarDocumento } from "@/components/captura/asociar-documento";
import { NOMBRE_TIPO } from "@/components/red/presentacion";
import { Etiqueta, Panel, Titulo } from "@/components/ui";
import { formatoFecha, obtenerEncargo } from "@/lib/datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";
import { cargarRegistro } from "@/lib/vista-datos";

const ORIGEN: Record<string, string> = {
  documento: "Documento",
  captura: "Captura manual",
  importacion: "Importación de Excel",
};

function valor(v: unknown): string {
  if (v === null || v === undefined) return "—";
  return typeof v === "object" ? JSON.stringify(v) : String(v);
}

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
                  <td className="px-4 py-2 text-texto">{x.valor_crudo ?? "—"}</td>
                  <td className="px-4 py-2 text-tenue">{valor(x.valor_normalizado)}</td>
                  <td className="px-4 py-2 font-mono text-xs text-tenue">
                    {x.metodo === "manual" ? "Captura manual" : x.ubicacion_texto}
                  </td>
                  <td className="px-4 py-2 text-xs text-tenue">
                    {x.metodo}
                    {x.confianza !== null ? ` · ${Number(x.confianza).toFixed(2)}` : ""} ·{" "}
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
      </div>
    </main>
  );
}
