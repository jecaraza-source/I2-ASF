"use client";

import { CATEGORIAS_MODULO, MODULOS } from "@sigma/modelo";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { cerrarSesion } from "@/acciones/sesion";

const ENCARGO =
  /^\/encargos\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(\/|$)/i;

const enlace =
  "block rounded-md px-3 py-2.5 text-[15px] text-texto hover:bg-panel-2 focus-visible:outline-2 focus-visible:outline-oro";

/**
 * Menú del celular: en pantallas angostas la barra lateral, el menú de módulos y la zona del usuario
 * se reúnen en un panel (`<dialog>` modal: atrapa el foco, Escape lo cierra y devuelve el foco).
 */
export function MenuMovil({
  organizacion,
  correo,
  rol,
  esAdmin,
  variasOrganizaciones,
}: {
  organizacion: string;
  correo: string;
  rol: string;
  esAdmin: boolean;
  variasOrganizaciones: boolean;
}) {
  const pathname = usePathname();
  const dialogo = useRef<HTMLDialogElement>(null);
  const encargoId = ENCARGO.exec(pathname)?.[1];
  const base = encargoId ? `/encargos/${encargoId}` : null;

  // Al navegar se cierra.
  useEffect(() => {
    dialogo.current?.close();
  }, [pathname]);

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-haspopup="dialog"
        onClick={() => dialogo.current?.showModal()}
        className="flex min-h-11 items-center gap-2 rounded-md border border-azul-borde px-3 text-sm text-azul-claro hover:text-texto focus-visible:outline-2 focus-visible:outline-oro"
      >
        <span aria-hidden className="text-base leading-none">
          ☰
        </span>
        Menú
      </button>
      <dialog
        ref={dialogo}
        aria-label="Menú"
        onClick={(ev) => {
          // Clic en el fondo (fuera del panel) cierra.
          if (ev.target === dialogo.current) dialogo.current.close();
        }}
        className="m-0 ml-auto h-dvh max-h-dvh w-[min(22rem,88vw)] max-w-none border-l border-linea-2 bg-fondo-2 p-0 text-texto backdrop:bg-black/60"
      >
        <div className="flex h-full flex-col overflow-y-auto overscroll-contain px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
          <div className="mb-3 flex items-start justify-between gap-3 border-b border-linea px-2 pb-3">
            <div className="min-w-0 text-xs">
              <p className="truncate text-sm text-azul-claro">{organizacion}</p>
              <p className="truncate text-tenue">{correo}</p>
              <p className="text-tenue">{rol}</p>
            </div>
            <button
              type="button"
              onClick={() => dialogo.current?.close()}
              className="min-h-11 rounded-md border border-linea-2 px-3 text-sm text-texto focus-visible:outline-2 focus-visible:outline-oro"
            >
              Cerrar
            </button>
          </div>

          <nav aria-label="Navegación principal">
            <ul className="flex flex-col">
              <li>
                <Link href="/encargos" className={enlace}>
                  Encargos
                </Link>
              </li>
            </ul>
            {base
              ? CATEGORIAS_MODULO.map((c) => {
                  const modulos = MODULOS.filter((m) => m.categoria === c.clave && m.listo);
                  if (modulos.length === 0) return null;
                  return (
                    <section key={c.clave} aria-label={c.nombre} className="mt-3">
                      <h2 className="px-3 text-[10px] tracking-[2px] text-oro uppercase">
                        {c.nombre}
                      </h2>
                      <ul className="mt-1 flex flex-col">
                        {modulos.map((m) => (
                          <li key={m.clave}>
                            <Link
                              href={`${base}${m.ruta}`}
                              aria-current={
                                pathname === `${base}${m.ruta}` ||
                                (m.ruta !== "" && pathname.startsWith(`${base}${m.ruta}/`))
                                  ? "page"
                                  : undefined
                              }
                              className={`${enlace} aria-[current=page]:text-oro`}
                            >
                              {m.nombre}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </section>
                  );
                })
              : null}
          </nav>

          <ul className="mt-4 flex flex-col border-t border-linea pt-3">
            {esAdmin ? (
              <>
                <li>
                  <Link href="/usuarios" className={enlace}>
                    Usuarios
                  </Link>
                </li>
                <li>
                  <Link href="/ia" className={enlace}>
                    Uso de IA
                  </Link>
                </li>
              </>
            ) : null}
            <li>
              <Link href="/acceso/contrasena" className={enlace}>
                Mi contraseña
              </Link>
            </li>
            {variasOrganizaciones ? (
              <li>
                <Link href="/organizacion" className={enlace}>
                  Cambiar de organización
                </Link>
              </li>
            ) : null}
            <li>
              <form action={cerrarSesion}>
                <button type="submit" className={`${enlace} w-full text-left`}>
                  Salir
                </button>
              </form>
            </li>
          </ul>
        </div>
      </dialog>
    </div>
  );
}
