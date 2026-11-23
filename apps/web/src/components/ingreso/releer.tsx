"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { releerExtraccion } from "@/acciones/ingreso";

/**
 * «Volver a leer con IA»: dos pasos para que nadie descarte una lectura por accidente.
 * La lectura anterior se conserva como reemplazada; lo que diga el documento se vuelve a extraer.
 */
export function BotonReleer({
  encargoId,
  registroId,
  documento,
  volverA,
}: {
  encargoId: string;
  registroId: string;
  documento: string;
  /** Página a la que se regresa después de pedir la lectura (p. ej. la cola de validación). */
  volverA?: string;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  function releer() {
    setMensaje(null);
    iniciar(async () => {
      const r = await releerExtraccion(encargoId, registroId);
      if (r.ok) {
        setConfirmando(false);
        setMensaje("En cola: la IA lo vuelve a leer en un momento.");
        if (volverA) router.push(volverA);
      } else {
        setMensaje(r.mensaje);
      }
    });
  }

  return (
    <div className="mt-1 text-xs">
      {confirmando ? (
        <div
          role="group"
          aria-label={`Confirmar nueva lectura de ${documento}`}
          className="rounded-md border border-linea bg-panel-2 p-2"
        >
          <p className="text-texto">
            La lectura actual se reemplaza y lo que falte por validar se pierde. La anterior queda
            en el historial.
          </p>
          <div className="mt-2 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={releer}
              disabled={enviando}
              className="rounded-md bg-oro px-2.5 py-1 font-medium text-fondo hover:bg-oro-suave disabled:opacity-60"
            >
              {enviando ? "Enviando…" : "Sí, volver a leer"}
            </button>
            <button
              type="button"
              onClick={() => setConfirmando(false)}
              disabled={enviando}
              className="text-tenue hover:underline"
            >
              Cancelar
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="text-azul-claro hover:underline"
          aria-label={`Volver a leer con IA ${documento}`}
        >
          Volver a leer con IA
        </button>
      )}
      {mensaje ? (
        <p role="status" className="mt-1 text-tenue">
          {mensaje}
        </p>
      ) : null}
    </div>
  );
}
