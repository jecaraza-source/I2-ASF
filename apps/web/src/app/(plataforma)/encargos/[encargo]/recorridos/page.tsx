import { TarjetasRecorridos } from "@/components/recorridos";
import { Titulo } from "@/components/ui";
import { obtenerEncargo } from "@/lib/datos";

export const metadata = { title: "Recorridos guiados — SIGMA" };

export default async function PaginaRecorridos({
  params,
}: {
  params: Promise<{ encargo: string }>;
}) {
  const { encargo: id } = await params;
  const encargo = await obtenerEncargo(id);
  return (
    <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
      <Titulo>Recorridos guiados</Titulo>
      <p className="-mt-3 mb-6 max-w-3xl text-sm text-tenue">
        Elige qué quieres lograr y sigue las etapas. Cada etapa te lleva al módulo donde se hace y
        te dice si ya está cubierta en este encargo.
      </p>
      <TarjetasRecorridos encargoId={encargo.id} />
    </main>
  );
}
