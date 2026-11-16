import { Suspense, type ReactNode } from "react";
import { BarraLateral, BarraLateralCargando } from "@/components/barra-lateral";
import { obtenerEncargo } from "@/lib/datos";

export default function LayoutEncargo({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ encargo: string }>;
}) {
  return (
    <>
      <Suspense fallback={<BarraLateralCargando />}>
        <Lateral params={params} />
      </Suspense>
      <div className="flex min-w-0 flex-1 flex-col">{children}</div>
    </>
  );
}

async function Lateral({ params }: { params: Promise<{ encargo: string }> }) {
  const { encargo: id } = await params;
  const encargo = await obtenerEncargo(id);
  return (
    <BarraLateral encargo={{ id: encargo.id, nombre: encargo.nombre, estado: encargo.estado }} />
  );
}
