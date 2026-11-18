import { puede } from "@sigma/modelo";
import { SinPermiso } from "@/components/estados";
import { FormularioExpediente } from "@/components/formularios/expediente";
import { Titulo } from "@/components/ui";
import { obtenerEncargo } from "@/lib/datos";
import { requerirOrganizacion } from "@/lib/sesion";

export default async function NuevoExpediente({
  params,
}: {
  params: Promise<{ encargo: string }>;
}) {
  const { encargo: id } = await params;
  const encargo = await obtenerEncargo(id);
  const { activa } = await requerirOrganizacion();
  return (
    <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
      <Titulo>Nuevo expediente</Titulo>
      {puede(activa.rol, "expediente.crear") ? (
        <FormularioExpediente encargoId={encargo.id} />
      ) : (
        <SinPermiso />
      )}
    </main>
  );
}
