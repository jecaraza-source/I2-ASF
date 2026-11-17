import { RECORRIDOS } from "@sigma/modelo";
import Link from "next/link";

/** Tarjetas de los recorridos guiados: empezar por una tarea en lugar de por un módulo. */
export function TarjetasRecorridos({ encargoId }: { encargoId: string }) {
  return (
    <ul aria-label="Recorridos guiados" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {RECORRIDOS.map((r, i) => (
        <li key={r.clave}>
          <Link
            href={`/encargos/${encargoId}/recorridos/${r.clave}`}
            className="flex h-full flex-col gap-1.5 rounded-lg border border-linea bg-panel p-4 hover:border-oro focus-visible:outline-2 focus-visible:outline-oro"
          >
            <span className="text-[10px] tracking-[2px] text-oro uppercase">Recorrido {i + 1}</span>
            <span className="text-base font-semibold text-texto">{r.nombre}</span>
            <span className="text-sm text-tenue">{r.objetivo}</span>
            <span className="mt-auto pt-2 text-xs text-tenue-2">
              {r.etapas.map((e) => e.titulo).join(" → ")}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
