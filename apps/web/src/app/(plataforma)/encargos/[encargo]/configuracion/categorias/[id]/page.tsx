import { puede } from "@sigma/modelo";
import { notFound } from "next/navigation";
import { z } from "zod";
import { SinPermiso } from "@/components/estados";
import { FormularioCategoria } from "@/components/formularios/catalogo";
import { Titulo } from "@/components/ui";
import { obtenerEncargo } from "@/lib/datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

export default async function EditarCategoria({
  params,
}: {
  params: Promise<{ encargo: string; id: string }>;
}) {
  const { encargo: encargoId, id } = await params;
  const encargo = await obtenerEncargo(encargoId);
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "catalogo.editar"))
    return (
      <main className="flex-1 px-8 py-8">
        <SinPermiso />
      </main>
    );
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("categoria_documental")
    .select("id, nombre, orden")
    .eq("id", id)
    .eq("organizacion_id", activa.organizacionId)
    .maybeSingle();
  if (!data) notFound();
  return (
    <main className="flex-1 px-8 py-8">
      <Titulo>Editar categoría</Titulo>
      <FormularioCategoria encargoId={encargo.id} categoria={data} />
    </main>
  );
}
