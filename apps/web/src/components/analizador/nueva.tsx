"use client";

import { useActionState, useId, useState } from "react";
import { crearSintesis } from "@/acciones/analizador";
import { BotonEnviar } from "@/components/formulario";
import { ESTADO_INICIAL } from "@/lib/formulario";

/** Elegir qué registros validados entran a la síntesis (todos marcados al inicio). */
export function NuevaSintesis({
  encargoId,
  alcanceTipo,
  alcanceId,
  registros,
}: {
  encargoId: string;
  alcanceTipo: "expediente" | "entidad";
  alcanceId: string;
  registros: { id: string; etiqueta: string }[];
}) {
  const [estado, enviar] = useActionState(crearSintesis, ESTADO_INICIAL);
  const [marcados, setMarcados] = useState<Set<string>>(new Set(registros.map((r) => r.id)));
  const id = useId();
  const todos = marcados.size === registros.length;
  return (
    <form action={enviar} className="flex flex-col gap-4">
      <input type="hidden" name="encargo_id" value={encargoId} />
      <input type="hidden" name="alcance_tipo" value={alcanceTipo} />
      <input type="hidden" name="alcance_id" value={alcanceId} />
      {estado.mensaje ? (
        <p
          role="alert"
          className="rounded-md border border-peligro/60 px-3 py-2 text-sm text-peligro"
        >
          {estado.mensaje}
        </p>
      ) : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm text-texto">
          Registros que entran a la síntesis ({marcados.size} de {registros.length})
        </legend>
        <label className="flex items-center gap-2 text-xs text-tenue">
          <input
            type="checkbox"
            checked={todos}
            onChange={() => setMarcados(todos ? new Set() : new Set(registros.map((r) => r.id)))}
          />
          Todos
        </label>
        <ul className="flex max-h-[28rem] flex-col gap-1 overflow-auto rounded-md border border-linea p-2">
          {registros.map((r, i) => (
            <li key={r.id}>
              <label htmlFor={`${id}-${i}`} className="flex items-start gap-2 text-sm text-texto">
                <input
                  id={`${id}-${i}`}
                  type="checkbox"
                  name="registros"
                  value={r.id}
                  checked={marcados.has(r.id)}
                  onChange={(e) =>
                    setMarcados((m) => {
                      const n = new Set(m);
                      if (e.target.checked) n.add(r.id);
                      else n.delete(r.id);
                      return n;
                    })
                  }
                  className="mt-1"
                />
                <span>
                  <span className="text-xs text-tenue">Registro {i + 1} · </span>
                  {r.etiqueta}
                </span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <p className="text-xs text-tenue">
        Solo esos registros viajan al proveedor de IA permitido en el encargo, y cada afirmación
        tendrá que citar al menos uno. El resultado nace como borrador.
      </p>
      <div>
        <BotonEnviar>Generar síntesis</BotonEnviar>
      </div>
    </form>
  );
}
