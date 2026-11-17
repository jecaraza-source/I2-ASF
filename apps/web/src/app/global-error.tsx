"use client";

import "./globals.css";

/** Falla del layout raíz: página mínima, sin detalles internos. */
export default function ErrorGlobal({ reset }: { reset: () => void }) {
  return (
    <html lang="es">
      <body className="flex min-h-screen items-center justify-center px-8">
        <main
          role="alert"
          className="flex max-w-md flex-col items-start gap-3 rounded-lg border border-peligro/50 bg-panel px-6 py-5"
        >
          <h1 className="text-lg font-semibold text-texto">La plataforma no respondió.</h1>
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
        </main>
      </body>
    </html>
  );
}
