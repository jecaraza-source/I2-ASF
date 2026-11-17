import type { MouseEvent } from "react";

/**
 * Abre el calendario del navegador al hacer clic en cualquier parte de un campo de fecha, no solo
 * en su ícono. La fecha se sigue pudiendo escribir con el teclado.
 */
export function abrirCalendario(e: MouseEvent<HTMLInputElement>) {
  try {
    e.currentTarget.showPicker?.();
  } catch {
    // Algunos navegadores lo rechazan fuera de un gesto del usuario; el campo sigue funcionando.
  }
}
