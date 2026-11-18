import { NOMBRE_ROL } from "@sigma/modelo";
import { Suspense } from "react";
import { elegirOrganizacion } from "@/acciones/sesion";
import { EstadoCargando } from "@/components/estados";
import { BarraMarca } from "@/components/marca";
import { requerirSesion } from "@/lib/sesion";

export const metadata = { title: "Organización — SIGMA" };

const ROLES = NOMBRE_ROL;

export default function Organizacion() {
  return (
    <>
      <BarraMarca />
      <main className="mx-auto w-full max-w-lg px-6 py-12">
        <h1 className="mb-6 text-xl font-semibold text-texto">Elige la organización</h1>
        <Suspense fallback={<EstadoCargando />}>
          <Lista />
        </Suspense>
      </main>
    </>
  );
}

async function Lista() {
  const sesion = await requerirSesion();
  if (sesion.membresias.length === 0) {
    return (
      <p
        role="alert"
        className="rounded-lg border border-linea-2 bg-panel px-5 py-4 text-sm text-tenue"
      >
        Tu usuario no pertenece a ninguna organización. Pide una invitación al administrador.
      </p>
    );
  }
  return (
    <ul className="flex flex-col gap-3">
      {sesion.membresias.map((m) => (
        <li key={m.organizacionId}>
          <form action={elegirOrganizacion}>
            <input type="hidden" name="organizacion_id" value={m.organizacionId} />
            <button
              type="submit"
              className="flex w-full items-center justify-between rounded-lg border border-linea bg-panel px-5 py-4 text-left hover:border-oro"
            >
              <span className="text-sm font-medium text-texto">{m.nombre}</span>
              <span className="text-xs text-tenue">
                {ROLES[m.rol]}
                {sesion.activa?.organizacionId === m.organizacionId ? " · activa" : ""}
              </span>
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
