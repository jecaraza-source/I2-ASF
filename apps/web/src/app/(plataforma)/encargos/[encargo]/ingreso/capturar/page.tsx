import { camposComunesDe, leerCamposEsperados } from "@sigma/importador/captura";
import { puede } from "@sigma/modelo";
import Link from "next/link";
import { CapturaManual } from "@/components/captura/captura-manual";
import { EstadoVacio } from "@/components/estados";
import { Etiqueta, Panel, Titulo } from "@/components/ui";
import { formatoFecha, obtenerEncargo } from "@/lib/datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

export default async function CapturaManualPagina({
  params,
}: {
  params: Promise<{ encargo: string }>;
}) {
  const { encargo: id } = await params;
  const encargo = await obtenerEncargo(id);
  const { activa } = await requerirOrganizacion();
  const supabase = await clienteServidor();
  const [{ data: tipos }, { data: expedientes }, { data: entidades }, { data: capturas }] =
    await Promise.all([
      supabase
        .from("tipo_documento")
        .select("id, nombre, campos_esperados, categoria_documental(nombre, orden)")
        .eq("organizacion_id", activa.organizacionId)
        .order("nombre"),
      supabase
        .from("expediente")
        .select("id, identificador")
        .eq("encargo_id", encargo.id)
        .order("identificador"),
      supabase
        .from("entidad")
        .select("nombre, tipo, identificadores")
        .eq("encargo_id", encargo.id)
        .is("fusionada_en", null)
        .in("tipo", ["persona_fisica", "persona_moral", "dependencia"])
        .order("nombre")
        .limit(2000),
      supabase
        .from("registro")
        .select("id, resumen, fuente, creado_en, documento_id")
        .eq("encargo_id", encargo.id)
        .eq("origen", "captura")
        .order("creado_en", { ascending: false })
        .limit(50),
    ]);
  const base = `/encargos/${encargo.id}`;
  const lista = [...(tipos ?? [])].sort(
    (a, b) =>
      (a.categoria_documental?.orden ?? 99) - (b.categoria_documental?.orden ?? 99) ||
      a.nombre.localeCompare(b.nombre),
  );

  return (
    <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
      <Titulo>Captura manual</Titulo>
      <p className="-mt-3 mb-6 max-w-3xl text-sm text-tenue">
        Para datos que no vienen en un archivo. El registro queda marcado «sin soporte documental»
        hasta que se le asocie el documento que lo respalda.
      </p>
      <div className="flex max-w-6xl flex-col gap-8">
        {!puede(activa.rol, "registro.capturar") ? (
          <Panel>
            <p className="text-sm text-tenue">
              Tu rol permite consultar las capturas, no crearlas.
            </p>
          </Panel>
        ) : lista.length === 0 ? (
          <EstadoVacio
            titulo="Falta el catálogo de tipos de documento."
            descripcion="Un administrador lo define en Configuración antes de capturar."
          />
        ) : (
          <CapturaManual
            encargoId={encargo.id}
            tipos={lista.map((t) => ({
              id: t.id,
              nombre: t.nombre,
              categoria: t.categoria_documental?.nombre ?? "Otros",
              campos: leerCamposEsperados(t.campos_esperados),
              comunes: camposComunesDe(t.campos_esperados),
            }))}
            expedientes={(expedientes ?? []).map((x) => ({ id: x.id, nombre: x.identificador }))}
            entidades={(entidades ?? []).map((e) => {
              const rfc = (e.identificadores as Record<string, unknown> | null)?.rfc;
              return { nombre: e.nombre, tipo: e.tipo, rfc: typeof rfc === "string" ? rfc : null };
            })}
          />
        )}

        <section aria-label="Capturas" className="overflow-x-auto rounded-lg border border-linea">
          <table className="tabla-tarjetas w-full text-left text-sm">
            <caption className="px-4 py-2 text-left text-sm font-semibold text-texto">
              Capturas del encargo ({(capturas ?? []).length})
            </caption>
            <thead className="bg-panel-2 text-xs tracking-wide text-tenue uppercase">
              <tr>
                <th scope="col" className="px-4 py-2">
                  Registro
                </th>
                <th scope="col" className="px-4 py-2">
                  Fuente declarada
                </th>
                <th scope="col" className="px-4 py-2">
                  Soporte
                </th>
                <th scope="col" className="px-4 py-2">
                  Capturado
                </th>
              </tr>
            </thead>
            <tbody>
              {(capturas ?? []).map((r) => (
                <tr key={r.id} className="border-t border-linea">
                  <td className="px-4 py-2">
                    <Link
                      href={`${base}/registros/${r.id}`}
                      className="text-azul-claro hover:underline"
                    >
                      {r.resumen ?? "Registro"}
                    </Link>
                  </td>
                  <td data-etiqueta="Fuente declarada" className="px-4 py-2 text-tenue">
                    {r.fuente ?? "—"}
                  </td>
                  <td data-etiqueta="Soporte" className="px-4 py-2">
                    {r.documento_id ? (
                      <Etiqueta tono="ok">Con documento</Etiqueta>
                    ) : (
                      <Etiqueta tono="oro">Sin soporte documental</Etiqueta>
                    )}
                  </td>
                  <td data-etiqueta="Capturado" className="px-4 py-2 text-tenue">
                    {formatoFecha(r.creado_en)}
                  </td>
                </tr>
              ))}
              {(capturas ?? []).length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-sm text-tenue">
                    Aún no hay capturas en este encargo.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </section>
      </div>
    </main>
  );
}
