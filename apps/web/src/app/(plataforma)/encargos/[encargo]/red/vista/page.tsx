import { Suspense } from "react";
import { EstadoCargando, EstadoVacio } from "@/components/estados";
import { VisorRed } from "@/components/red/visor";
import { EnlaceBoton, Titulo } from "@/components/ui";
import { formatoFecha, obtenerEncargo } from "@/lib/datos";
import { clienteServidor } from "@/lib/supabase/servidor";
import { cargarVista, ultimaGeneracion } from "@/lib/vista-datos";

export default async function VistaRed({ params }: { params: Promise<{ encargo: string }> }) {
  const { encargo: id } = await params;
  const encargo = await obtenerEncargo(id);
  const supabase = await clienteServidor();
  const gen = await ultimaGeneracion(supabase, encargo.id);
  const volver = (
    <EnlaceBoton href={`/encargos/${encargo.id}/red`} variante="secundario">
      Generaciones y calificaciones
    </EnlaceBoton>
  );

  if (!gen) {
    return (
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <Titulo accion={volver}>Vista de la red</Titulo>
        <EstadoVacio
          titulo="Aún no hay una red generada."
          descripcion="Genera la red del encargo para poder explorarla."
        />
      </main>
    );
  }

  const grafo = await cargarVista(supabase, encargo.id, gen.id);
  return (
    <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
      <Titulo accion={volver}>Vista de la red</Titulo>
      <p className="-mt-3 mb-4 text-sm text-tenue">
        Generación del {formatoFecha(gen.generada_en)} · reglas versión {gen.version_reglas}
      </p>
      <Suspense fallback={<EstadoCargando texto="Preparando la red…" />}>
        <VisorRed encargoId={encargo.id} grafo={grafo} />
      </Suspense>
    </main>
  );
}
