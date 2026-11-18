import Link from "next/link";
import { ModulosAgrupados } from "@/components/modulos-agrupados";

/** Los módulos salen del catálogo único (`@sigma/modelo`), agrupados igual que en el celular. */

export function BarraLateral({
  encargo,
}: {
  encargo: { id: string; nombre: string; estado: string };
}) {
  const base = `/encargos/${encargo.id}`;
  return (
    <aside
      className="hidden w-60 flex-none border-r border-linea bg-fondo-2 px-3 py-5 md:block"
      aria-label="Módulos del encargo"
    >
      <div className="mb-5 px-2">
        <Link href="/encargos" className="text-xs text-tenue hover:text-texto">
          ← Encargos
        </Link>
        <p className="mt-2 text-[10px] tracking-[2px] text-oro uppercase">Encargo activo</p>
        <p className="mt-0.5 text-sm font-semibold text-texto" data-testid="encargo-activo">
          {encargo.nombre}
        </p>
        <p className="text-xs text-tenue">{encargo.estado}</p>
      </div>
      <nav aria-label="Módulos">
        <ModulosAgrupados
          base={base}
          claseEnlace="block rounded-md px-2 py-1.5 text-sm text-texto hover:bg-panel hover:text-oro-suave"
        />
      </nav>
    </aside>
  );
}

export function BarraLateralCargando() {
  return (
    <aside
      className="hidden w-60 flex-none border-r border-linea bg-fondo-2 md:block"
      aria-busy="true"
    />
  );
}
