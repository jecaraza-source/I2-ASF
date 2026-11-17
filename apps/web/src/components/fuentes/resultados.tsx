"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { incorporarResultado, revisarResultado } from "@/acciones/fuentes";
import { Etiqueta } from "@/components/ui";

export type ResultadoVista = {
  id: string;
  fuente: string;
  externa: boolean;
  coincidencia: "exacta" | "propuesta";
  estado: "pendiente" | "confirmada" | "descartada";
  resumen: string;
  /** Situación de la lista 69-B, si aplica. */
  situacion: string | null;
  /** Enlace a la entidad en otro encargo (otros expedientes). */
  enlace: string | null;
  por: string | null;
  consultadoEn: string;
  revisadoEn: string | null;
  motivo: string | null;
  registroId: string | null;
};

const fechaHora = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const SITUACION: Record<string, { texto: string; alerta: boolean }> = {
  definitivo: { texto: "Definitivo", alerta: true },
  presunto: { texto: "Presunto", alerta: true },
  desvirtuado: { texto: "Desvirtuado", alerta: false },
  sentencia_favorable: { texto: "Sentencia favorable", alerta: false },
};
const POR: Record<string, string> = { rfc: "por RFC", curp: "por CURP", nombre: "por nombre" };

function Fila({
  r,
  encargoId,
  puedeRevisar,
}: {
  r: ResultadoVista;
  encargoId: string;
  puedeRevisar: boolean;
}) {
  const router = useRouter();
  const [enviando, iniciar] = useTransition();
  const [descartando, setDescartando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const situacion = r.situacion ? SITUACION[r.situacion] : undefined;

  const revisar = (estado: "confirmada" | "descartada") =>
    iniciar(async () => {
      const x = await revisarResultado({ resultadoId: r.id, estado, motivo: motivo || undefined });
      if (x.ok) {
        setError(null);
        setDescartando(false);
        router.refresh();
      } else setError(x.mensaje);
    });
  const incorporar = () =>
    iniciar(async () => {
      const x = await incorporarResultado(r.id);
      if (x.ok) router.push(`/encargos/${encargoId}/registros/${x.dato}`);
      else setError(x.mensaje);
    });

  return (
    <li
      className={`flex flex-col gap-1.5 rounded-md border border-linea px-3 py-2 ${r.estado === "descartada" ? "opacity-60" : ""}`}
    >
      <div className="flex flex-wrap items-center gap-2 text-sm">
        {r.enlace ? (
          <Link href={r.enlace} className="text-azul-claro hover:underline">
            {r.resumen}
          </Link>
        ) : (
          <span className="text-texto">{r.resumen}</span>
        )}
        <Etiqueta tono={r.coincidencia === "exacta" ? "oro" : "neutro"}>
          {r.coincidencia === "exacta" ? "Coincidencia exacta" : "Propuesta"}
          {r.por && POR[r.por] ? ` · ${POR[r.por]}` : ""}
        </Etiqueta>
        {situacion ? (
          <span
            className={`text-xs font-semibold ${situacion.alerta ? "text-peligro" : "text-ok"}`}
          >
            {situacion.texto}
          </span>
        ) : null}
        <Etiqueta tono={r.estado === "confirmada" ? "ok" : "neutro"}>
          {r.estado === "pendiente"
            ? "Sin revisar"
            : r.estado === "confirmada"
              ? "Confirmada"
              : "Descartada"}
        </Etiqueta>
      </div>
      <p className="text-xs text-tenue">
        {r.fuente} · consultada el {fechaHora.format(new Date(r.consultadoEn))}
        {r.revisadoEn ? ` · revisada el ${fechaHora.format(new Date(r.revisadoEn))}` : ""}
        {r.motivo ? ` · motivo: ${r.motivo}` : ""}
      </p>
      {r.registroId ? (
        <Link
          href={`/encargos/${encargoId}/registros/${r.registroId}`}
          className="text-xs text-azul-claro underline"
        >
          Incorporado como registro
        </Link>
      ) : null}
      {puedeRevisar && r.estado === "pendiente" ? (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={enviando}
            onClick={() => revisar("confirmada")}
            aria-label={`Confirmar: ${r.resumen}`}
            className="rounded-md border border-linea-2 px-2.5 py-1 text-xs text-texto hover:border-ok hover:text-ok disabled:opacity-60"
          >
            Confirmar
          </button>
          <button
            type="button"
            disabled={enviando}
            onClick={() => setDescartando((v) => !v)}
            aria-expanded={descartando}
            aria-label={`Descartar: ${r.resumen}`}
            className="rounded-md border border-linea-2 px-2.5 py-1 text-xs text-texto hover:border-peligro hover:text-peligro disabled:opacity-60"
          >
            Descartar
          </button>
        </div>
      ) : null}
      {descartando ? (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-tenue">
            Motivo del descarte
            <input
              value={motivo}
              maxLength={500}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Homónimo, otro RFC…"
              className="w-72 rounded-md border border-linea-2 bg-fondo-2 px-2 py-1.5 text-sm text-texto focus:border-oro focus:outline-none"
            />
          </label>
          <button
            type="button"
            disabled={enviando}
            onClick={() => revisar("descartada")}
            className="rounded-md border border-peligro px-2.5 py-1.5 text-xs text-peligro disabled:opacity-60"
          >
            Confirmar descarte
          </button>
        </div>
      ) : null}
      {puedeRevisar && r.externa && r.estado === "confirmada" && !r.registroId ? (
        <div>
          <button
            type="button"
            disabled={enviando}
            onClick={incorporar}
            className="rounded-md border border-linea-2 px-2.5 py-1 text-xs text-texto hover:border-oro disabled:opacity-60"
          >
            Incorporar como registro
          </button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-peligro">
          {error}
        </p>
      ) : null}
    </li>
  );
}

export function ResultadosConsulta({
  resultados,
  encargoId,
  puedeRevisar,
  vacio,
}: {
  resultados: ResultadoVista[];
  encargoId: string;
  puedeRevisar: boolean;
  vacio: string;
}) {
  if (!resultados.length) return <p className="text-sm text-tenue">{vacio}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {resultados.map((r) => (
        <Fila key={r.id} r={r} encargoId={encargoId} puedeRevisar={puedeRevisar} />
      ))}
    </ul>
  );
}
