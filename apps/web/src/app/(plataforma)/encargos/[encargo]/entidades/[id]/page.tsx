import { puede } from "@sigma/modelo";
import { notFound } from "next/navigation";
import { BotonConsultarFuentes } from "@/components/fuentes/consultar";
import { ResultadosConsulta } from "@/components/fuentes/resultados";
import { Ficha } from "@/components/red/ficha";
import { NOMBRE_TIPO } from "@/components/red/presentacion";
import { EnlaceBoton, Panel, Titulo } from "@/components/ui";
import { obtenerEncargo } from "@/lib/datos";
import { cargarConsultas } from "@/lib/fuentes/ficha";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";
import { cargarFicha } from "@/lib/vista-datos";

/** La consulta de fuentes corre después de responder. */
export const maxDuration = 300;

const fechaHora = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

export default async function FichaEntidad({
  params,
}: {
  params: Promise<{ encargo: string; id: string }>;
}) {
  const { encargo: encargoId, id } = await params;
  const encargo = await obtenerEncargo(encargoId);
  const supabase = await clienteServidor();
  const ficha = await cargarFicha(supabase, encargo.id, id);
  if (!ficha) notFound();
  const { activa } = await requerirOrganizacion();
  const consultas = await cargarConsultas(supabase, encargo.id, ficha.entidad.id);
  const puedeConsultar = puede(activa.rol, "fuente.consultar");

  return (
    <main className="flex-1 px-8 py-8">
      <Titulo
        accion={
          <EnlaceBoton
            href={`/encargos/${encargo.id}/red/vista?foco=${ficha.entidad.id}&saltos=1&ruta=${ficha.entidad.id}`}
            variante="secundario"
          >
            Ver en la red
          </EnlaceBoton>
        }
      >
        {ficha.entidad.nombre}
      </Titulo>
      <p className="-mt-3 mb-6 text-sm text-tenue">
        {NOMBRE_TIPO[ficha.entidad.tipo] ?? ficha.entidad.tipo}
      </p>
      <div className="flex max-w-4xl flex-col gap-6">
        <Panel>
          <Ficha ficha={ficha} encargoId={encargo.id} />
        </Panel>

        <section
          aria-label="Fuentes de consulta"
          className="flex flex-col gap-4 rounded-lg border border-linea bg-panel p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-texto">Fuentes de consulta</h2>
              <p className="text-xs text-tenue" data-testid="estado-consulta">
                {consultas.enCurso
                  ? "Consulta en curso…"
                  : consultas.ultimaConsulta
                    ? `Última consulta: ${fechaHora.format(new Date(consultas.ultimaConsulta))}`
                    : "Aún no se ha consultado."}
              </p>
            </div>
            {puedeConsultar ? (
              <BotonConsultarFuentes
                encargoId={encargo.id}
                entidadId={ficha.entidad.id}
                texto="Consultar fuentes"
              />
            ) : null}
          </div>

          <section aria-label="Otros expedientes" className="flex flex-col gap-2">
            <h3 className="text-xs tracking-wide text-oro uppercase">Otros expedientes</h3>
            <p className="text-xs text-tenue-2">
              La misma entidad en otros encargos de tu organización. Nunca se busca fuera de ella.
            </p>
            <ResultadosConsulta
              resultados={consultas.otrosExpedientes}
              encargoId={encargo.id}
              puedeRevisar={puedeConsultar}
              vacio="Sin coincidencias en otros encargos."
            />
          </section>

          <section aria-label="Coincidencias externas" className="flex flex-col gap-2">
            <h3 className="text-xs tracking-wide text-oro uppercase">Coincidencias externas</h3>
            <p className="text-xs text-tenue-2">
              Por RFC o CURP la coincidencia es exacta; por nombre es una propuesta que un auditor
              confirma o descarta. Las fuentes externas se consultan sobre copias cargadas en la
              plataforma: ningún dato sale de ella.
            </p>
            <ResultadosConsulta
              resultados={consultas.externas}
              encargoId={encargo.id}
              puedeRevisar={puedeConsultar}
              vacio="Sin coincidencias en fuentes externas."
            />
          </section>
        </section>
      </div>
    </main>
  );
}
