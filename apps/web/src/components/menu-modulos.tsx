"use client";

import { CATEGORIAS_MODULO, MODULOS, type CategoriaModulo } from "@sigma/modelo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const ENCARGO =
  /^\/encargos\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/|$)/i;

/**
 * Menú superior: los módulos del encargo agrupados por capacidad, cada uno con su descripción.
 * El cursor previsualiza una categoría; clic, Enter o Espacio la abren o cierran; Escape la cierra
 * y devuelve el foco; un clic o el foco fuera también la cierran. Solo aparece dentro de un encargo.
 */
export function MenuModulos() {
  const pathname = usePathname();
  const encargoId = ENCARGO.exec(pathname)?.[1];
  const [abierta, setAbierta] = useState<CategoriaModulo | null>(null);
  // Fijada = se abrió con clic o teclado: no se cierra al salir el cursor.
  const [fijada, setFijada] = useState(false);
  const raiz = useRef<HTMLElement>(null);
  const botones = useRef(new Map<CategoriaModulo, HTMLButtonElement>());
  const cerrar = () => {
    setAbierta(null);
    setFijada(false);
  };

  useEffect(() => {
    if (!abierta) return;
    const fuera = (ev: PointerEvent) => {
      if (!raiz.current?.contains(ev.target as Node)) cerrar();
    };
    document.addEventListener("pointerdown", fuera);
    return () => document.removeEventListener("pointerdown", fuera);
  }, [abierta]);

  if (!encargoId) return null;
  const base = `/encargos/${encargoId}`;

  return (
    <nav
      ref={raiz}
      aria-label="Menú de módulos"
      className="hidden items-center gap-1 lg:flex"
      onKeyDown={(ev) => {
        if (ev.key === "Escape" && abierta) {
          ev.stopPropagation();
          botones.current.get(abierta)?.focus();
          cerrar();
        }
      }}
      onBlur={(ev) => {
        if (!raiz.current?.contains(ev.relatedTarget as Node | null)) cerrar();
      }}
    >
      {CATEGORIAS_MODULO.map((c, i) => {
        const estaAbierta = abierta === c.clave;
        const panel = `menu-${c.clave}`;
        return (
          <div
            key={c.clave}
            className="relative"
            onMouseEnter={() => {
              if (!fijada) setAbierta(c.clave);
            }}
            onMouseLeave={() => {
              if (!fijada) setAbierta(null);
            }}
          >
            <button
              type="button"
              ref={(el) => {
                if (el) botones.current.set(c.clave, el);
                else botones.current.delete(c.clave);
              }}
              aria-expanded={estaAbierta}
              aria-controls={panel}
              onClick={() => {
                if (estaAbierta && fijada) cerrar();
                else {
                  setAbierta(c.clave);
                  setFijada(true);
                }
              }}
              className="rounded-md px-3 py-1.5 text-xs font-semibold tracking-wide text-azul-claro uppercase hover:text-texto focus-visible:outline-2 focus-visible:outline-oro aria-expanded:bg-azul-profundo aria-expanded:text-texto"
            >
              {c.nombre} <span aria-hidden>▾</span>
            </button>
            {estaAbierta ? (
              <ul
                id={panel}
                aria-label={c.nombre}
                className={`absolute top-full z-30 w-80 rounded-lg border border-linea-2 bg-panel p-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.6)] ${
                  i === CATEGORIAS_MODULO.length - 1 ? "right-0" : "left-0"
                }`}
              >
                {MODULOS.filter((m) => m.categoria === c.clave).map((m) => (
                  <li key={m.clave}>
                    {m.listo ? (
                      <Link
                        href={`${base}${m.ruta}`}
                        onClick={cerrar}
                        className="block rounded-md px-3 py-2 hover:bg-panel-2 focus-visible:outline-2 focus-visible:outline-oro"
                      >
                        <span className="block text-sm font-medium text-texto">{m.nombre}</span>
                        <span className="block text-xs text-tenue">{m.descripcion}</span>
                      </Link>
                    ) : (
                      <span aria-disabled="true" className="block px-3 py-2">
                        <span className="block text-sm font-medium text-tenue-2">
                          {m.nombre} <span className="text-[10px]">· próximamente</span>
                        </span>
                        <span className="block text-xs text-tenue-2">{m.descripcion}</span>
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}
