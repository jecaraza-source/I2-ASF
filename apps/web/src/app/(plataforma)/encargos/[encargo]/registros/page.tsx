import { leerFiltrosDocumental } from "@sigma/modelo";
import { Suspense } from "react";
import { Documental } from "@/components/documental/documental";
import { EstadoCargando } from "@/components/estados";
import { Titulo } from "@/components/ui";
import { obtenerEncargo } from "@/lib/datos";
import { requerirOrganizacion } from "@/lib/sesion";

export const metadata = { title: "Registros — SIGMA" };

type Parametros = Promise<Record<string, string | string[] | undefined>>;

/** Todos los registros del encargo: la vista por entidad y los registros sin expediente viven aquí. */
export default function PaginaRegistros({
  params,
  searchParams,
}: {
  params: Promise<{ encargo: string }>;
  searchParams: Parametros;
}) {
  return (
    <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
      <Titulo>Registros del encargo</Titulo>
      <p className="-mt-3 mb-6 max-w-3xl text-sm text-tenue">
        Todo lo que entró al encargo —documentos, capturas y filas de Excel— en una sola tabla.
        Elige un expediente, una entidad o una categoría en el árbol, o cambia de vista.
      </p>
      <Suspense fallback={<EstadoCargando texto="Cargando registros…" />}>
        <Contenido params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Contenido({
  params,
  searchParams,
}: {
  params: Promise<{ encargo: string }>;
  searchParams: Parametros;
}) {
  const { encargo: id } = await params;
  const encargo = await obtenerEncargo(id);
  const { activa } = await requerirOrganizacion();
  return (
    <Documental
      encargoId={encargo.id}
      rol={activa.rol}
      filtros={leerFiltrosDocumental(await searchParams)}
    />
  );
}
