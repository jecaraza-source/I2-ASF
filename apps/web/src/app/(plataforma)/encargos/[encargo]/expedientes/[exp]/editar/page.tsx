import { puede } from "@sigma/modelo";
import { SinPermiso } from "@/components/estados";
import { FormularioExpediente } from "@/components/formularios/expediente";
import { Titulo } from "@/components/ui";
import { obtenerExpediente } from "@/lib/datos";
import { requerirOrganizacion } from "@/lib/sesion";

export default async function EditarExpediente({
  params,
}: {
  params: Promise<{ encargo: string; exp: string }>;
}) {
  const { encargo: encargoId, exp } = await params;
  const expediente = await obtenerExpediente(encargoId, exp);
  const { activa } = await requerirOrganizacion();
  return (
    <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
      <Titulo>Editar expediente</Titulo>
      {puede(activa.rol, "expediente.editar") ? (
        <FormularioExpediente encargoId={encargoId} expediente={expediente} />
      ) : (
        <SinPermiso />
      )}
    </main>
  );
}
