import Link from "next/link";

/** Módulos de docs/ESPECIFICACION.md §1. Los que aún no existen se muestran deshabilitados. */
const MODULOS = [
  { ruta: "", texto: "Resumen", listo: true },
  { ruta: "/expedientes", texto: "Expedientes", listo: true },
  { ruta: "/importaciones", texto: "Importación de Excel", listo: true },
  { ruta: "/red", texto: "Red de vínculos", listo: true },
  { ruta: "/alertas", texto: "Alertas", listo: true },
  { ruta: "/ingreso/importar", texto: "Ingreso de documentos", listo: false },
  { ruta: "/ingreso/capturar", texto: "Captura manual", listo: false },
  { ruta: "/validacion", texto: "Validación", listo: false },
  { ruta: "/configuracion", texto: "Configuración", listo: true },
] as const;

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
          {MODULOS.map((m) => (
            <li key={m.texto}>
              {m.listo ? (
                <Link
                  href={`${base}${m.ruta}`}
                  className="block rounded-md px-2 py-1.5 text-sm text-texto hover:bg-panel hover:text-oro-suave"
                >
                  {m.texto}
                </Link>
              ) : (
                <span
                  aria-disabled="true"
                  className="flex items-center justify-between rounded-md px-2 py-1.5 text-sm text-tenue-2"
                >
                  {m.texto}
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
