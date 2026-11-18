import { puede } from "@sigma/modelo";
import { SinPermiso } from "@/components/estados";
import { Importador } from "@/components/importador/importador";
import { Titulo } from "@/components/ui";
import { obtenerEncargo } from "@/lib/datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

export default async function NuevaImportacion({
  params,
}: {
  params: Promise<{ encargo: string }>;
}) {
  const { encargo: id } = await params;
  const encargo = await obtenerEncargo(id);
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "importacion.crear")) {
    return (
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <Titulo>Nueva importación</Titulo>
        <SinPermiso />
      </main>
    );
  }
  const supabase = await clienteServidor();
  const { data: expedientes } = await supabase
    .from("expediente")
    .select("id, identificador")
    .eq("encargo_id", encargo.id)
    .order("identificador")
    .limit(500);
  return (
    <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
      <Titulo>Nueva importación</Titulo>
      <Importador
        encargoId={encargo.id}
        expedientes={expedientes ?? []}
        puedeGuardarPlantilla={puede(activa.rol, "plantilla.editar")}
      />
    </main>
  );
}
