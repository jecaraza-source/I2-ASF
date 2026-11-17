"use client";

import { formatoDe, leerTablas, sha256Hex } from "@sigma/importador/leer-navegador";
import {
  NOMBRE_SITUACION_69B,
  SITUACIONES_69B,
  leerLista69b,
  type Fila69b,
} from "@sigma/importador/lista69b";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { agregarLoteLista, cerrarCargaLista, iniciarCargaLista } from "@/acciones/fuentes";

const LOTE = 2000;

type Leido = {
  nombre: string;
  formato: "csv" | "xlsx";
  sha256: string;
  filas: Fila69b[];
  descartadas: { fila: number; motivo: string }[];
  repetidas: number;
};

/**
 * Carga de la lista 69-B: el navegador lee el CSV o Excel, muestra un resumen y envía las filas por
 * lotes; el servidor valida cada fila. Del archivo se guarda su huella SHA-256 (el original no se
 * sube por ahora; `carga_fuente.storage_path` queda reservado para hacerlo).
 */
export function CargaLista69b({ fuenteId }: { fuenteId: string }) {
  const router = useRouter();
  const id = useId();
  const [leido, setLeido] = useState<Leido | null>(null);
  const [estado, setEstado] = useState<
    | { fase: "inicio" }
    | { fase: "leyendo" }
    | { fase: "cargando"; enviadas: number }
    | { fase: "lista"; filas: number }
  >({ fase: "inicio" });
  const [error, setError] = useState<string | null>(null);

  const elegir = async (archivo: File | undefined) => {
    setLeido(null);
    setError(null);
    if (!archivo) return;
    const formato = formatoDe(archivo.name);
    if (!formato) {
      setError("Elige un archivo .csv o .xlsx.");
      return;
    }
    if (archivo.size > 60 * 1024 * 1024) {
      setError("El archivo pesa más de 60 MB: no parece la lista del SAT.");
      return;
    }
    setEstado({ fase: "leyendo" });
    try {
      const bytes = await archivo.arrayBuffer();
      const [sha256, tablas] = await Promise.all([sha256Hex(bytes), leerTablas(bytes, formato)]);
      const lecturas = tablas.map(leerLista69b);
      const buena = lecturas.find((l) => l.ok);
      if (!buena || !buena.ok) {
        const motivo = lecturas.find((l) => !l.ok);
        setError(motivo && !motivo.ok ? motivo.motivo : "No se pudo leer el archivo.");
        setEstado({ fase: "inicio" });
        return;
      }
      setLeido({ nombre: archivo.name, formato, sha256, ...buena });
      setEstado({ fase: "inicio" });
    } catch {
      setError("No se pudo leer el archivo. Verifica que sea el CSV o Excel del SAT.");
      setEstado({ fase: "inicio" });
    }
  };

  const cargar = async () => {
    if (!leido) return;
    setError(null);
    setEstado({ fase: "cargando", enviadas: 0 });
    const inicio = await iniciarCargaLista({
      fuenteId,
      nombreArchivo: leido.nombre,
      formato: leido.formato,
      sha256: leido.sha256,
      filasEsperadas: leido.filas.length,
    });
    if (!inicio.ok) {
      setError(inicio.mensaje);
      setEstado({ fase: "inicio" });
      return;
    }
    for (let i = 0; i < leido.filas.length; i += LOTE) {
      const r = await agregarLoteLista({
        cargaId: inicio.dato,
        filas: leido.filas.slice(i, i + LOTE),
      });
      if (!r.ok) {
        setError(`${r.mensaje} La lista anterior sigue vigente.`);
        setEstado({ fase: "inicio" });
        return;
      }
      setEstado({ fase: "cargando", enviadas: Math.min(i + LOTE, leido.filas.length) });
    }
    const cierre = await cerrarCargaLista(inicio.dato);
    if (!cierre.ok) {
      setError(`${cierre.mensaje} La lista anterior sigue vigente.`);
      setEstado({ fase: "inicio" });
      return;
    }
    setLeido(null);
    setEstado({ fase: "lista", filas: cierre.dato });
    router.refresh();
  };

  const porSituacion = leido
    ? SITUACIONES_69B.map(
        (s) => [s, leido.filas.filter((f) => f.situacion === s).length] as const,
      ).filter(([, n]) => n > 0)
    : [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-archivo`} className="text-sm text-texto">
          Archivo de la lista (CSV o Excel del SAT)
        </label>
        <input
          id={`${id}-archivo`}
          type="file"
          accept=".csv,.txt,.xlsx"
          disabled={estado.fase === "cargando" || estado.fase === "leyendo"}
          onChange={(e) => void elegir(e.target.files?.[0])}
          className="text-sm text-texto file:mr-3 file:rounded-md file:border file:border-linea-2 file:bg-fondo-2 file:px-3 file:py-1.5 file:text-texto"
        />
      </div>
      {estado.fase === "leyendo" ? (
        <p role="status" className="text-sm text-tenue">
          Leyendo el archivo…
        </p>
      ) : null}
      {leido ? (
        <div
          className="flex flex-col gap-2 rounded-md border border-linea-2 p-3 text-sm"
          aria-label="Resumen del archivo"
        >
          <p className="text-texto" data-testid="resumen-lista">
            {leido.filas.length.toLocaleString("es-MX")} contribuyente(s) con RFC válido
            {leido.repetidas ? ` · ${leido.repetidas} repetido(s) omitido(s)` : ""}
            {leido.descartadas.length ? ` · ${leido.descartadas.length} fila(s) inválida(s)` : ""}
          </p>
          <p className="text-xs text-tenue">
            {porSituacion
              .map(([s, n]) => `${NOMBRE_SITUACION_69B[s]}: ${n.toLocaleString("es-MX")}`)
              .join(" · ")}
          </p>
          {leido.descartadas.length ? (
            <p className="text-xs text-tenue">
              No se cargan:{" "}
              {leido.descartadas
                .slice(0, 5)
                .map((d) => `fila ${d.fila} (${d.motivo})`)
                .join(", ")}
              {leido.descartadas.length > 5 ? "…" : ""}
            </p>
          ) : null}
          <p className="font-mono text-[10px] text-tenue-2">SHA-256 {leido.sha256}</p>
          <div>
            <button
              type="button"
              onClick={() => void cargar()}
              className="rounded-md bg-oro px-3.5 py-2 text-sm font-medium text-fondo hover:bg-oro-suave"
            >
              Cargar lista
            </button>
          </div>
        </div>
      ) : null}
      {estado.fase === "cargando" && leido ? (
        <p role="status" className="text-sm text-tenue">
          Cargando… {estado.enviadas.toLocaleString("es-MX")} de{" "}
          {leido.filas.length.toLocaleString("es-MX")}
        </p>
      ) : null}
      {estado.fase === "lista" ? (
        <p role="status" className="text-sm text-ok">
          Lista cargada: {estado.filas.toLocaleString("es-MX")} contribuyente(s), vigente desde
          ahora. Vuelve a consultar las entidades para usarla.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-peligro">
          {error}
        </p>
      ) : null}
    </div>
  );
}
