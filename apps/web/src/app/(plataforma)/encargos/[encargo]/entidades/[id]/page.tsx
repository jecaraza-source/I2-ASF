import { notFound } from "next/navigation";
import { Ficha } from "@/components/red/ficha";
import { NOMBRE_TIPO } from "@/components/red/presentacion";
import { EnlaceBoton, Panel, Titulo } from "@/components/ui";
import { obtenerEncargo } from "@/lib/datos";
import { clienteServidor } from "@/lib/supabase/servidor";
import { cargarFicha } from "@/lib/vista-datos";

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
      <Panel className="max-w-4xl">
        <Ficha ficha={ficha} encargoId={encargo.id} />
      </Panel>
    </main>
  );
}
