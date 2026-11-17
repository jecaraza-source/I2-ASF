import { leerFiltrosDocumental, puede } from "@sigma/modelo";
import { Suspense } from "react";
import { Documental } from "@/components/documental/documental";
import { EstadoCargando } from "@/components/estados";
import { MenuExportar } from "@/components/exportar/menu";
import { EnlaceBoton, Titulo } from "@/components/ui";
import { formatoFecha, obtenerExpediente } from "@/lib/datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";
import { ultimaGeneracion } from "@/lib/vista-datos";

type Parametros = Promise<Record<string, string | string[] | undefined>>;

export default async function Expediente({
  params,
  searchParams,
}: {
  params: Promise<{ encargo: string; exp: string }>;
  searchParams: Parametros;
}) {
  const { encargo: encargoId, exp } = await params;
  const expediente = await obtenerExpediente(encargoId, exp);
  const { activa } = await requerirOrganizacion();
  const red = await ultimaGeneracion(await clienteServidor(), encargoId);
  return (
    <main className="flex-1 px-8 py-8">
      <Titulo
        accion={
          <div className="flex flex-wrap items-start gap-3">
            {puede(activa.rol, "sintesis.generar") ? (
              <EnlaceBoton
                variante="secundario"
                href={`/encargos/${encargoId}/analizador/nueva?expediente=${expediente.id}`}
              >
                Analizar
              </EnlaceBoton>
            ) : null}
            {red && puede(activa.rol, "red.exportar") ? (
              <MenuExportar
                encargoId={encargoId}
                expedienteId={expediente.id}
                nota={`Entidades de este expediente en la red del ${formatoFecha(red.generada_en)}, y lo que las une.`}
              />
            ) : null}
            {puede(activa.rol, "expediente.editar") ? (
              <EnlaceBoton
                variante="secundario"
                href={`/encargos/${encargoId}/expedientes/${expediente.id}/editar`}
              >
                Editar expediente
              </EnlaceBoton>
            ) : null}
          </div>
        }
      >
        <span className="font-mono">{expediente.identificador}</span>
      </Titulo>
      <dl className="-mt-3 mb-6 flex flex-wrap gap-x-6 gap-y-1 text-sm">
        <div className="flex gap-2">
          <dt className="text-tenue">Número de control</dt>
          <dd className="text-texto">{expediente.numero_control ?? "—"}</dd>
        </div>
        <div className="flex gap-2">
          <dt className="text-tenue">Alta</dt>
          <dd className="text-texto">{formatoFecha(expediente.creado_en)}</dd>
        </div>
        {expediente.descripcion ? (
          <div className="flex basis-full gap-2">
            <dt className="text-tenue">Descripción</dt>
            <dd className="whitespace-pre-wrap text-texto">{expediente.descripcion}</dd>
          </div>
        ) : null}
      </dl>
      <Suspense fallback={<EstadoCargando texto="Cargando registros…" />}>
        <Registros encargoId={encargoId} expedienteId={expediente.id} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Registros({
  encargoId,
  expedienteId,
  searchParams,
}: {
  encargoId: string;
  expedienteId: string;
  searchParams: Parametros;
}) {
  const { activa } = await requerirOrganizacion();
  return (
    <Documental
      encargoId={encargoId}
      rol={activa.rol}
      filtros={leerFiltrosDocumental(await searchParams)}
      expedienteFijo={expedienteId}
    />
  );
}
