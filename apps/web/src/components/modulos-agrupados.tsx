"use client";

import { CATEGORIAS_MODULO, MODULOS } from "@sigma/modelo";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Módulos del encargo agrupados por capacidad (Integración de fuentes, Análisis, Gestión del
 * encargo). Lo usan la barra lateral (escritorio) y el menú del celular, para que ambos se lean
 * igual. Marca el módulo de la página actual.
 */
export function ModulosAgrupados({
  base,
  claseEnlace,
}: {
  /** `/encargos/<id>` */
  base: string;
  claseEnlace: string;
}) {
  const pathname = usePathname();
  const actual = (ruta: string) =>
    ruta === ""
      ? pathname === base
      : pathname === `${base}${ruta}` || pathname.startsWith(`${base}${ruta}/`);
  // Si una ruta es prefijo de otra (Red → Vista de la red), gana la más larga.
  const rutasActuales = MODULOS.filter((m) => m.listo && actual(m.ruta)).map((m) => m.ruta);
  const masLarga = rutasActuales.sort((a, b) => b.length - a.length)[0];

  return (
    <>
      {CATEGORIAS_MODULO.map((c, i) => {
        const modulos = MODULOS.filter((m) => m.categoria === c.clave && m.listo);
        if (modulos.length === 0) return null;
        return (
          // Sin aria-label en el grupo: el título basta y no choca con etiquetas de formularios («Fuente»).
          <div key={c.clave} className={i ? "mt-4" : ""}>
            <h2 className="px-2 text-[10px] tracking-[2px] text-oro uppercase">{c.nombre}</h2>
            <ul className="mt-1 flex flex-col gap-0.5">
              {modulos.map((m) => (
                <li key={m.clave}>
                  <Link
                    href={`${base}${m.ruta}`}
                    aria-current={m.ruta === masLarga ? "page" : undefined}
                    className={`${claseEnlace} aria-[current=page]:bg-panel aria-[current=page]:text-oro`}
                  >
                    {m.nombre}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </>
  );
}
