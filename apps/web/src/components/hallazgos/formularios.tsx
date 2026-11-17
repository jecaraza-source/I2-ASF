"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  adjuntarSintesis,
  crearHallazgo,
  firmarHallazgo,
  guardarRedaccion,
} from "@/acciones/hallazgos";
import { AreaTexto, Formulario, Selector } from "@/components/formulario";

/** Hallazgo nuevo: la redacción la escribe el auditor; la síntesis solo lo respalda. */
export function NuevoHallazgo({
  encargoId,
  sintesisId,
}: {
  encargoId: string;
  sintesisId?: string;
}) {
  return (
    <Formulario
      accion={crearHallazgo}
      textoEnviar="Crear hallazgo"
      ocultos={{ encargo_id: encargoId, ...(sintesisId ? { sintesis_id: sintesisId } : {}) }}
    >
      {(estado) => (
        <AreaTexto
          nombre="redaccion"
          etiqueta={sintesisId ? "Redacción del hallazgo nuevo" : "Redacción del hallazgo"}
          ayuda={
            sintesisId
              ? "La redactas tú: la síntesis queda adjunta como respaldo, su texto no se copia."
              : "Condición, criterio, causa y efecto, en tus palabras."
          }
          estado={estado}
          requerido
        />
      )}
    </Formulario>
  );
}

export function AdjuntarAHallazgo({
  encargoId,
  sintesisId,
  hallazgos,
}: {
  encargoId: string;
  sintesisId: string;
  hallazgos: { id: string; texto: string }[];
}) {
  return (
    <Formulario
      accion={adjuntarSintesis}
      textoEnviar="Adjuntar"
      ocultos={{ encargo_id: encargoId, sintesis_id: sintesisId }}
    >
      {(estado) => (
        <Selector
          nombre="hallazgo_id"
          etiqueta="Adjuntar a un hallazgo sin firmar"
          opciones={hallazgos.map((h) => ({ valor: h.id, texto: h.texto }))}
          estado={estado}
        />
      )}
    </Formulario>
  );
}

export function RedaccionHallazgo({
  encargoId,
  id,
  redaccion,
}: {
  encargoId: string;
  id: string;
  redaccion: string;
}) {
  return (
    <Formulario
      accion={guardarRedaccion}
      textoEnviar="Guardar redacción"
      ocultos={{ encargo_id: encargoId, id }}
    >
      {(estado) => (
        <AreaTexto
          nombre="redaccion"
          etiqueta="Redacción"
          valor={redaccion}
          estado={estado}
          requerido
        />
      )}
    </Formulario>
  );
}

export function BotonFirmar({ encargoId, hallazgoId }: { encargoId: string; hallazgoId: string }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [enviando, iniciar] = useTransition();
  return (
    <div className="flex flex-col items-start gap-2">
      {confirmando ? (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-sm text-texto">Firmado, el hallazgo ya no cambia. ¿Firmar?</p>
          <button
            type="button"
            disabled={enviando}
            className="rounded-md bg-oro px-4 py-2 text-sm font-medium text-fondo hover:bg-oro-suave disabled:opacity-60"
            onClick={() =>
              iniciar(async () => {
                const r = await firmarHallazgo({ encargoId, hallazgoId });
                setAviso({ ok: r.ok, texto: r.mensaje });
                if (r.ok) router.refresh();
              })
            }
          >
            Confirmar firma
          </button>
          <button
            type="button"
            className="text-sm text-tenue underline"
            onClick={() => setConfirmando(false)}
          >
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="rounded-md border border-linea-2 px-3.5 py-2 text-sm text-texto hover:border-oro"
          onClick={() => setConfirmando(true)}
        >
          Firmar hallazgo
        </button>
      )}
      {aviso ? (
        <p
          role={aviso.ok ? "status" : "alert"}
          className={`text-sm ${aviso.ok ? "text-ok" : "text-peligro"}`}
        >
          {aviso.texto}
        </p>
      ) : null}
    </div>
  );
}
