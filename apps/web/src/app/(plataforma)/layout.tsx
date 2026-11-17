import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { cerrarSesion } from "@/acciones/sesion";
import { BarraMarca } from "@/components/marca";
import { MenuModulos } from "@/components/menu-modulos";
import { BarraNavegacion } from "@/components/navegacion";
import { requerirOrganizacion } from "@/lib/sesion";

const ROLES = { admin: "Administrador", auditor: "Auditor", lector: "Lector" } as const;

export default function LayoutPlataforma({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#contenido"
        className="sr-only z-50 rounded-md bg-oro px-3 py-2 text-sm font-medium text-fondo focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Saltar al contenido
      </a>
      <BarraMarca
        centro={
          <Suspense fallback={null}>
            <MenuModulos />
          </Suspense>
        }
      >
        <Suspense fallback={<span className="text-xs text-azul-medio">…</span>}>
          <ZonaUsuario />
        </Suspense>
      </BarraMarca>
      <Suspense fallback={null}>
        <BarraNavegacion />
      </Suspense>
      <div id="contenido" tabIndex={-1} className="flex flex-1 focus:outline-none">
        {children}
      </div>
    </div>
  );
}

async function ZonaUsuario() {
  const sesion = await requerirOrganizacion();
  return (
    <div className="flex items-center gap-4 text-xs">
      <div className="text-right">
        <p className="text-azul-claro" data-testid="organizacion-activa">
          {sesion.activa.nombre}
        </p>
        <p className="text-azul-medio">
          {sesion.usuario.email} · <span data-testid="rol-activo">{ROLES[sesion.activa.rol]}</span>
        </p>
      </div>
      {sesion.activa.rol === "admin" ? (
        <>
          <Link href="/usuarios" className="text-azul-claro underline hover:text-texto">
            Usuarios
          </Link>
          <Link href="/ia" className="text-azul-claro underline hover:text-texto">
            Uso de IA
          </Link>
        </>
      ) : null}
      <Link href="/acceso/contrasena" className="text-azul-claro underline hover:text-texto">
        Mi contraseña
      </Link>
      {sesion.membresias.length > 1 ? (
        <Link href="/organizacion" className="text-azul-claro underline hover:text-texto">
          Cambiar
        </Link>
      ) : null}
      <form action={cerrarSesion}>
        <button
          type="submit"
          className="rounded border border-azul-borde px-2.5 py-1 text-azul-claro hover:text-texto"
        >
          Salir
        </button>
      </form>
    </div>
  );
}
