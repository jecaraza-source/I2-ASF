import { puede } from "@sigma/modelo";
import { SinPermiso } from "@/components/estados";
import { FormularioEncargo } from "@/components/formularios/encargo";
import { Titulo } from "@/components/ui";
import { obtenerEncargo } from "@/lib/datos";
import { requerirOrganizacion } from "@/lib/sesion";

export default async function EditarEncargo({ params }: { params: Promise<{ encargo: string }> }) {
  const { encargo: id } = await params;
  const encargo = await obtenerEncargo(id);
  const { activa } = await requerirOrganizacion();
  return (
    <main className="flex-1 px-8 py-8">
      <Titulo>Editar encargo</Titulo>
      {puede(activa.rol, "encargo.editar") ? (
        <FormularioEncargo encargo={encargo} />
      ) : (
        <SinPermiso />
      )}
    </main>
  );
}
