import Link from "next/link";

/** Ruta inexistente o recurso de otra organización: el mismo mensaje en ambos casos. */
export default function NoEncontrado() {
  return (
    <main className="flex flex-1 items-center justify-center px-8 py-16">
      <div className="flex max-w-md flex-col items-start gap-3 rounded-lg border border-linea bg-panel px-6 py-5">
        <h1 className="text-lg font-semibold text-texto">No encontramos esta página</h1>
        <p className="text-sm text-tenue">
          La dirección no existe o no tienes acceso a ella con tu organización actual.
        </p>
        <Link href="/encargos" className="text-sm text-azul-claro underline hover:text-texto">
          Ir a mis encargos
        </Link>
      </div>
    </main>
  );
}
