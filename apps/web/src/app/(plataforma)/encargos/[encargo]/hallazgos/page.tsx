import { puede } from "@sigma/modelo";
import Link from "next/link";
import { EstadoVacio } from "@/components/estados";
import { NuevoHallazgo } from "@/components/hallazgos/formularios";
import { Etiqueta, Panel, Titulo } from "@/components/ui";
import { listarHallazgos } from "@/lib/analizador-datos";
import { formatoFecha, obtenerEncargo } from "@/lib/datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

export default async function Hallazgos({ params }: { params: Promise<{ encargo: string }> }) {
  const { encargo: id } = await params;
  const encargo = await obtenerEncargo(id);
  const { activa } = await requerirOrganizacion();
  const hallazgos = await listarHallazgos(await clienteServidor(), encargo.id);

  return (
    <main className="flex-1 px-8 py-8">
      <Titulo>Hallazgos</Titulo>
      <p className="-mt-3 mb-6 max-w-3xl text-sm text-tenue">
        Los redacta y firma un auditor. Se respaldan en alertas confirmadas y en síntesis aprobadas
        del Analizador; nada de eso los crea solo. Firmado, un hallazgo ya no cambia.
      </p>
      <div className="flex max-w-4xl flex-col gap-6">
        {hallazgos.length === 0 ? (
          <EstadoVacio
            titulo="Aún no hay hallazgos."
            descripcion="Redacta uno aquí o desde una síntesis aprobada del Analizador."
          />
        ) : (
          <ul aria-label="Hallazgos del encargo" className="flex flex-col gap-2">
            {hallazgos.map((h) => (
              <li key={h.id} className="rounded-md border border-linea bg-panel px-4 py-3">
                <Link
                  href={`/encargos/${encargo.id}/hallazgos/${h.id}`}
                  className="text-sm text-texto hover:text-oro"
                >
                  {h.redaccion.slice(0, 160)}
                  {h.redaccion.length > 160 ? "…" : ""}
                </Link>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-tenue">
                  <Etiqueta tono={h.firmado_en ? "ok" : "oro"}>
                    {h.firmado_en ? "Firmado" : "Sin firmar"}
                  </Etiqueta>
                  {formatoFecha(h.creado_en)} · {h.hallazgo_sintesis.length} síntesis ·{" "}
                  {h.hallazgo_alerta.length} alerta(s)
                </p>
              </li>
            ))}
          </ul>
        )}
        {puede(activa.rol, "hallazgo.editar") ? (
          <Panel>
            <h2 className="mb-3 text-base font-semibold text-texto">Nuevo hallazgo</h2>
            <NuevoHallazgo encargoId={encargo.id} />
          </Panel>
        ) : null}
      </div>
    </main>
  );
}
