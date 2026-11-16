import { puede } from "@sigma/modelo";
import { Suspense } from "react";
import { EstadoCargando, SinPermiso } from "@/components/estados";
import { FormularioEncargo } from "@/components/formularios/encargo";
import { Titulo } from "@/components/ui";
import { requerirOrganizacion } from "@/lib/sesion";

export const metadata = { title: "Nuevo encargo — SIGMA" };

export default function NuevoEncargo() {
  return (
    <main className="flex-1 px-8 py-8">
      <Titulo>Nuevo encargo</Titulo>
      <Suspense fallback={<EstadoCargando />}>
        <Contenido />
      </Suspense>
    </main>
  );
}

async function Contenido() {
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "encargo.crear")) return <SinPermiso />;
  return <FormularioEncargo />;
}
