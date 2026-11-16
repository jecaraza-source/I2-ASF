"use client";

/** Contenido de los error.tsx: mensaje genérico, nunca detalles internos. */
export function ErrorPantalla({ reset }: { reset: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-lg border border-peligro/50 bg-panel px-5 py-4"
    >
      <p className="text-sm font-semibold text-texto">No se pudo cargar esta pantalla.</p>
      <p className="text-sm text-tenue">
        Intenta de nuevo. Si el problema sigue, avisa al administrador.
      </p>
      <button
        type="button"
        onClick={reset}
        className="rounded-md border border-linea-2 px-3 py-1.5 text-sm text-texto hover:border-oro"
      >
        Reintentar
      </button>
    </div>
  );
}
