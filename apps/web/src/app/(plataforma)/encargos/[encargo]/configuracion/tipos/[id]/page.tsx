import { puede } from "@sigma/modelo";
import { notFound } from "next/navigation";
import { z } from "zod";
import { SinPermiso } from "@/components/estados";
import { CAMPOS_COMUNES, camposComunesDe } from "@sigma/importador/captura";
import {
  FormularioCamposComunes,
  FormularioTipoDocumento,
} from "@/components/formularios/catalogo";
import { Titulo } from "@/components/ui";
import { obtenerEncargo } from "@/lib/datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

export default async function EditarTipo({
  params,
}: {
  params: Promise<{ encargo: string; id: string }>;
}) {
  const { encargo: encargoId, id } = await params;
  const encargo = await obtenerEncargo(encargoId);
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "catalogo.editar"))
    return (
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
        <SinPermiso />
      </main>
    );
  if (!z.uuid().safeParse(id).success) notFound();
  const supabase = await clienteServidor();
  const [{ data: tipo }, { data: categorias }] = await Promise.all([
    supabase
      .from("tipo_documento")
      .select("id, clave, nombre, categoria_id, campos_esperados")
      .eq("id", id)
      .eq("organizacion_id", activa.organizacionId)
      .maybeSingle(),
    supabase
      .from("categoria_documental")
      .select("id, nombre")
      .eq("organizacion_id", activa.organizacionId)
      .order("orden"),
  ]);
  if (!tipo) notFound();
  return (
    <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-8">
      <Titulo>Editar tipo de documento</Titulo>
      <FormularioTipoDocumento
        encargoId={encargo.id}
        categorias={categorias ?? []}
        tipo={{
          id: tipo.id,
          clave: tipo.clave,
          nombre: tipo.nombre,
          categoria_id: tipo.categoria_id,
        }}
      />
      <div className="mt-10 max-w-xl border-t border-linea pt-6">
        <FormularioCamposComunes
          tipoId={tipo.id}
          comunes={CAMPOS_COMUNES}
          ajustados={camposComunesDe(tipo.campos_esperados)}
        />
      </div>
    </main>
  );
}
