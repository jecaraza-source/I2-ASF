import { MODULOS } from "@sigma/modelo";
import Link from "next/link";

/** Los módulos salen del catálogo único (`@sigma/modelo`); los no construidos van deshabilitados. */
const MODULOS_LATERAL = MODULOS.filter((m) => !("lateral" in m && m.lateral === false));

export function BarraLateral({
  encargo,
}: {
  encargo: { id: string; nombre: string; estado: string };
}) {
  const base = `/encargos/${encargo.id}`;
  return (
    <aside
      className="w-60 flex-none border-r border-linea bg-fondo-2 px-3 py-5"
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
        <ul className="flex flex-col gap-0.5">
          {MODULOS_LATERAL.map((m) => (
            <li key={m.clave}>
              {m.listo ? (
                <Link
                  href={`${base}${m.ruta}`}
                  className="block rounded-md px-2 py-1.5 text-sm text-texto hover:bg-panel hover:text-oro-suave"
                >
                  {m.nombre}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-tenue-2"
                >
                  {m.nombre}
                  <span className="text-[10px]">próximamente</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

export function BarraLateralCargando() {
  return <aside className="w-60 flex-none border-r border-linea bg-fondo-2" aria-busy="true" />;
}
