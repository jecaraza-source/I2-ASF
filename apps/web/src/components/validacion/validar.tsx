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
 * Validación de un documento leído por la IA: el original fijo arriba (un tercio de la pantalla) y,
 * debajo, el mismo formulario de la captura con lo que propuso la IA. Enfocar un campo lleva el documento a su
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
  const [ampliado, setAmpliado] = useState(false);
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

  const irAlSiguiente = () => {
    const lista = [...document.querySelectorAll<HTMLElement>("[data-por-revisar='true']")];
    if (!lista.length) return;
    const i = lista.indexOf(document.activeElement as HTMLElement);
    const destino = lista[(i + 1) % lista.length];
    destino?.focus({ preventScroll: true });
    destino?.scrollIntoView({ block: "center", behavior: "smooth" });
  };
  const ancla = pagina
    ? `#page=${pagina}&view=Fit&toolbar=0&navpanes=0`
    : "#view=Fit&toolbar=0&navpanes=0";

  return (
    <div className="flex flex-col gap-4">
      {/*
        El original queda fijo arriba, en una franja de un tercio de la pantalla como máximo; los
        datos se recorren debajo. Enfocar un dato lleva la franja a su página.
      */}
      <section
        aria-label="Documento original"
        className="sticky top-[58px] z-10 -mx-4 border-b border-linea bg-fondo px-4 pt-2 pb-3 md:top-0 md:-mx-8 md:px-8"
      >
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-tenue">
          <span className="max-w-full truncate text-texto">{documento.nombre}</span>
          <span aria-live="polite">
            {pagina ? `Página ${pagina}` : "Enfoca un dato para ir a su página"}
          </span>
          {documento.url ? (
            <span className="ml-auto flex gap-2">
              <button
                type="button"
                onClick={() => setAmpliado((v) => !v)}
                aria-expanded={ampliado}
                className="rounded-md border border-linea-2 px-2.5 py-1 text-texto hover:border-oro"
              >
                {ampliado ? "Reducir" : "Ampliar"}
              </button>
              <a
                href={documento.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-md border border-linea-2 px-2.5 py-1 text-texto hover:border-oro"
              >
                Abrir original
              </a>
            </span>
          ) : null}
        </div>
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
            key={pagina ?? 0}
            src={`${documento.url}${ancla}`}
            title={`Original: ${documento.nombre}`}
            className={`w-full rounded-lg border border-linea bg-white ${ampliado ? "h-[65vh]" : "h-[30vh] min-h-40"}`}
          />
        ) : documento.clase === "imagen" ? (
          <div
            className={`flex justify-center overflow-auto rounded-lg border border-linea bg-panel ${ampliado ? "h-[65vh]" : "h-[30vh] min-h-40"}`}
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- URL firmada de corta duración; no se optimiza ni se cachea. */}
            <img
              src={documento.url}
              alt={`Original: ${documento.nombre}`}
              className="h-full w-auto max-w-none object-contain"
            />
          </div>
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
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-linea bg-panel px-4 py-3 text-sm text-tenue">
          <span className="font-medium text-oro">
            {porRevisar
              ? `${porRevisar} dato(s) por revisar.`
              : "Todos los datos superaron el umbral de confianza."}
          </span>
          {porRevisar ? (
            <button
              type="button"
              onClick={irAlSiguiente}
              className="rounded-md border border-oro px-3 py-1.5 text-sm text-oro hover:bg-oro/10"
            >
              Siguiente por revisar ↓
            </button>
          ) : null}
          <span className="basis-full">
            Deja un campo como está para aceptarlo, cámbialo para corregirlo o vacíalo para
            rechazarlo. Atajos: <kbd>Ctrl</kbd>+<kbd>Enter</kbd> valida y pasa al siguiente;{" "}
            <kbd>Alt</kbd>+<kbd>↓</kbd> y <kbd>Alt</kbd>+<kbd>↑</kbd> recorren los datos por
            revisar.
          </span>
        </div>
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
