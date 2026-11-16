import type { ReactNode } from "react";

export function EstadoVacio({
  titulo,
  descripcion,
  accion,
}: {
  titulo: string;
  descripcion?: string;
  accion?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-linea-2 px-6 py-12 text-center">
      <p className="text-sm font-semibold text-texto">{titulo}</p>
      {descripcion ? <p className="max-w-md text-sm text-tenue">{descripcion}</p> : null}
      {accion}
    </div>
  );
}

export function EstadoCargando({ texto = "Cargando…" }: { texto?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 px-1 py-8 text-sm text-tenue"
    >
      <span className="size-4 animate-spin rounded-full border-2 border-linea-2 border-t-oro" />
      {texto}
    </div>
  );
}

export function SinPermiso({ texto }: { texto?: string }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-linea-2 bg-panel px-5 py-4 text-sm text-tenue"
    >
      {texto ?? "Tu rol no permite esta acción. Pide acceso a un administrador de la organización."}
    </div>
  );
}
