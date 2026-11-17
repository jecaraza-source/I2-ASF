import { puede } from "@sigma/modelo";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BotonFirmar, RedaccionHallazgo } from "@/components/hallazgos/formularios";
import { Etiqueta, EnlaceBoton, Panel, Titulo } from "@/components/ui";
import { cargarHallazgo, NOMBRE_ESTADO_SINTESIS } from "@/lib/analizador-datos";
import { formatoFecha, obtenerEncargo } from "@/lib/datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

export default async function Hallazgo({
  params,
}: {
  params: Promise<{ encargo: string; id: string }>;
}) {
  const { encargo: encargoId, id } = await params;
  const encargo = await obtenerEncargo(encargoId);
  const { activa } = await requerirOrganizacion();
  const h = await cargarHallazgo(await clienteServidor(), encargo.id, id);
  if (!h) notFound();
  const editable = !h.firmado_en && puede(activa.rol, "hallazgo.editar");

  return (
    <main className="flex-1 px-8 py-8">
      <Titulo
        accion={
          <EnlaceBoton href={`/encargos/${encargo.id}/hallazgos`} variante="secundario">
            Todos los hallazgos
          </EnlaceBoton>
        }
      >
        Hallazgo
      </Titulo>
      <p
        className="-mt-3 mb-6 flex items-center gap-2 text-xs text-tenue"
        data-testid="estado-hallazgo"
      >
        <Etiqueta tono={h.firmado_en ? "ok" : "oro"}>
          {h.firmado_en ? "Firmado" : "Sin firmar"}
        </Etiqueta>
        Creado el {formatoFecha(h.creado_en)}
        {h.firmado_en ? ` · firmado el ${formatoFecha(h.firmado_en)}` : ""}
      </p>
      <div className="flex max-w-4xl flex-col gap-6">
        <Panel className="flex flex-col gap-4">
          {editable ? (
            <>
              <RedaccionHallazgo encargoId={encargo.id} id={h.id} redaccion={h.redaccion} />
              <BotonFirmar encargoId={encargo.id} hallazgoId={h.id} />
            </>
          ) : (
            <p className="text-sm whitespace-pre-wrap text-texto" data-testid="redaccion-hallazgo">
              {h.redaccion}
            </p>
          )}
        </Panel>
        <Panel>
          <h2 className="mb-3 text-base font-semibold text-texto">Síntesis que lo respaldan</h2>
          {h.sintesis.length ? (
            <ul aria-label="Síntesis adjuntas" className="flex flex-col gap-1 text-sm">
              {h.sintesis.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/encargos/${encargo.id}/analizador/${s.id}`}
                    className="text-texto hover:text-oro"
                  >
                    {s.alcance_tipo === "expediente" ? "Expediente" : "Entidad"} {s.nombre}
                  </Link>{" "}
                  <span className="text-xs text-tenue">
                    · {NOMBRE_ESTADO_SINTESIS[s.estado] ?? s.estado}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-tenue">
              Ninguna. Desde una síntesis aprobada del Analizador puedes adjuntarla.
            </p>
          )}
        </Panel>
        <Panel>
          <h2 className="mb-3 text-base font-semibold text-texto">Alertas vinculadas</h2>
          {h.hallazgo_alerta.length ? (
            <ul className="flex flex-col gap-1 text-sm">
              {h.hallazgo_alerta.flatMap((a) =>
                a.alerta ? (
                  <li key={a.alerta.id}>
                    <Link
                      href={`/encargos/${encargo.id}/alertas/${a.alerta.id}`}
                      className="text-texto hover:text-oro"
                    >
                      {a.alerta.regla} · {a.alerta.severidad} · {a.alerta.estado}
                    </Link>
                  </li>
                ) : (
                  []
                ),
              )}
            </ul>
          ) : (
            <p className="text-sm text-tenue">Ninguna.</p>
          )}
        </Panel>
      </div>
    </main>
  );
}
