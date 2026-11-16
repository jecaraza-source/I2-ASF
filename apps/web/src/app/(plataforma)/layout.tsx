import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { cerrarSesion } from "@/acciones/sesion";
import { BarraMarca } from "@/components/marca";
import { requerirOrganizacion } from "@/lib/sesion";

const ROLES = { admin: "Administrador", auditor: "Auditor", lector: "Lector" } as const;

export default function LayoutPlataforma({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <BarraMarca>
        <Suspense fallback={<span className="text-xs text-azul-medio">…</span>}>
          <ZonaUsuario />
        </Suspense>
      </BarraMarca>
      <div className="flex flex-1">{children}</div>
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
