"use client";

import type { EntradaCaptura } from "@sigma/importador/captura";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { rechazarRegistro, validarRegistro } from "@/acciones/validacion";
import {
  FormularioRegistro,
  type Anotacion,
  type EntidadConocida,
  type InicialRegistro,
  type TipoParaCaptura,
} from "@/components/captura/formulario-registro";

/**
 * Validación de un documento leído por la IA: el original a la izquierda y, a la derecha, el mismo
 * formulario de la captura con lo que propuso la IA. Enfocar un campo lleva el documento a su
 * página. Nada alimenta entidades ni vínculos hasta que el auditor valida.
 */
export function ValidarRegistro({
  encargoId,
  registroId,
  siguienteId,
  documento,
  tipo,
  expedientes,
  entidades,
  inicial,
  anotaciones,
}: {
  encargoId: string;
  registroId: string;
  /** Otro registro de la cola, para pasar a él al terminar. */
  siguienteId: string | null;
  documento: { nombre: string; url: string | null; clase: "pdf" | "imagen" | "otro" };
  tipo: TipoParaCaptura;
  expedientes: { id: string; nombre: string }[];
  entidades: EntidadConocida[];
  inicial: InicialRegistro;
  anotaciones: Record<string, Anotacion>;
}) {
  const router = useRouter();
  const [pagina, setPagina] = useState<number | null>(null);
  const [rechazando, setRechazando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [errorRechazo, setErrorRechazo] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();
  const base = `/encargos/${encargoId}/validacion`;
  const continuar = () => router.push(siguienteId ? `${base}/${siguienteId}` : `${base}?listo=1`);
  const porRevisar = Object.values(anotaciones).filter((a) => a.porRevisar).length;

  const rechazar = () =>
    iniciar(async () => {
      const r = await rechazarRegistro(registroId, motivo);
      if (r.ok) continuar();
      else setErrorRechazo(r.mensaje);
    });

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <section aria-label="Documento original" className="xl:sticky xl:top-4 xl:self-start">
        <p className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-tenue">
          <span className="truncate text-texto">{documento.nombre}</span>
          <span aria-live="polite">
            {pagina ? `Página ${pagina}` : "Enfoca un campo para ir a su página"}
          </span>
        </p>
        {!documento.url ? (
          <p
            role="alert"
            className="rounded-lg border border-linea bg-panel p-4 text-sm text-tenue"
          >
            No se pudo abrir el original. Recarga la página.
          </p>
        ) : documento.clase === "pdf" ? (
          // El original es hostil: se muestra desde el dominio del almacenamiento, no del nuestro.
          <iframe
            src={pagina ? `${documento.url}#page=${pagina}` : documento.url}
            title={`Original: ${documento.nombre}`}
            className="h-[78vh] w-full rounded-lg border border-linea bg-white"
          />
        ) : documento.clase === "imagen" ? (
          // eslint-disable-next-line @next/next/no-img-element -- URL firmada de corta duración; no se optimiza ni se cachea.
          <img
            src={documento.url}
            alt={`Original: ${documento.nombre}`}
            className="max-h-[78vh] max-w-full rounded-lg border border-linea"
          />
        ) : (
          <p className="rounded-lg border border-linea bg-panel p-4 text-sm text-tenue">
            Este tipo de archivo no tiene vista previa.{" "}
            <a href={documento.url} className="text-azul-claro underline">
              Descárgalo
            </a>{" "}
            para revisarlo.
          </p>
        )}
      </section>

      <section aria-label="Lectura de la IA" className="flex flex-col gap-4">
        <p className="rounded-lg border border-linea bg-panel px-4 py-3 text-sm text-tenue">
          <span className="text-texto">
            {porRevisar
              ? `${porRevisar} dato(s) por revisar.`
              : "Todos los datos superaron el umbral de confianza."}
          </span>{" "}
          Deja un campo como está para aceptarlo, cámbialo para corregirlo o vacíalo para
          rechazarlo. Atajos: <kbd>Ctrl</kbd>+<kbd>Enter</kbd> valida y pasa al siguiente;{" "}
          <kbd>Alt</kbd>+<kbd>↓</kbd> y <kbd>Alt</kbd>+<kbd>↑</kbd> recorren los datos por revisar.
        </p>
        <FormularioRegistro
          encargoId={encargoId}
          tipos={[tipo]}
          expedientes={expedientes}
          entidades={entidades}
          inicial={inicial}
          anotaciones={anotaciones}
          alEnfocar={(a) => {
            if (a.pagina) setPagina(a.pagina);
          }}
          textoGuardar={siguienteId ? "Validar y pasar al siguiente" : "Validar registro"}
          guardar={(entrada: EntradaCaptura) => validarRegistro(registroId, entrada)}
          alGuardar={continuar}
          acciones={
            <button
              type="button"
              onClick={() => setRechazando((v) => !v)}
              aria-expanded={rechazando}
              className="rounded-md border border-linea-2 px-4 py-2 text-sm text-texto hover:border-peligro hover:text-peligro"
            >
              Rechazar registro
            </button>
          }
        />
        {rechazando ? (
          <div className="flex flex-col gap-2 rounded-lg border border-peligro/50 bg-panel p-4">
            <label htmlFor="motivo-rechazo" className="text-sm text-texto">
              Motivo del rechazo
            </label>
            <textarea
              id="motivo-rechazo"
              rows={2}
              maxLength={500}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              aria-describedby="motivo-rechazo-ayuda"
              className="w-full rounded-md border border-linea-2 bg-fondo-2 px-3 py-2 text-sm text-texto focus:border-oro focus:outline-none"
            />
            <p id="motivo-rechazo-ayuda" className="text-xs text-tenue">
              Se descarta la lectura completa: no crea entidades ni vínculos. El documento original
              se conserva y el motivo queda en bitácora.
            </p>
            {errorRechazo ? (
              <p role="alert" className="text-sm text-peligro">
                {errorRechazo}
              </p>
            ) : null}
            <div>
              <button
                type="button"
                onClick={rechazar}
                disabled={enviando}
                className="rounded-md border border-peligro px-4 py-2 text-sm text-peligro hover:bg-peligro/10 disabled:opacity-60"
              >
                {enviando ? "Rechazando…" : "Confirmar rechazo"}
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
