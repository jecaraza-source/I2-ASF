import { puede } from "@sigma/modelo";
import { EnlaceBoton, Panel, Titulo } from "@/components/ui";
import { formatoFecha, obtenerExpediente } from "@/lib/datos";
import { requerirOrganizacion } from "@/lib/sesion";

export default async function Expediente({
  params,
}: {
  params: Promise<{ encargo: string; exp: string }>;
}) {
  const { encargo: encargoId, exp } = await params;
  const expediente = await obtenerExpediente(encargoId, exp);
  const { activa } = await requerirOrganizacion();
  return (
    <main className="flex-1 px-8 py-8">
      <Titulo
        accion={
          puede(activa.rol, "expediente.editar") ? (
            <EnlaceBoton
              variante="secundario"
              href={`/encargos/${encargoId}/expedientes/${expediente.id}/editar`}
            >
              Editar expediente
            </EnlaceBoton>
          ) : null
        }
      >
        <span className="font-mono">{expediente.identificador}</span>
      </Titulo>
      <Panel>
        <dl className="grid grid-cols-[10rem_1fr] gap-y-2 text-sm">
          <dt className="text-tenue">Número de control</dt>
          <dd className="text-texto">{expediente.numero_control ?? "—"}</dd>
          <dt className="text-tenue">Descripción</dt>
          <dd className="whitespace-pre-wrap text-texto">{expediente.descripcion ?? "—"}</dd>
          <dt className="text-tenue">Alta</dt>
          <dd className="text-texto">{formatoFecha(expediente.creado_en)}</dd>
        </dl>
      </Panel>
      <p className="mt-6 text-sm text-tenue">
        Los registros del expediente se muestran aquí a partir de la tarea 10.
      </p>
    </main>
  );
}
