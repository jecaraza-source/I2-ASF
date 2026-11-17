"use client";

import { NOMBRE_ROL, type Rol } from "@sigma/modelo";
import { useActionState, useId, useState } from "react";
import { cancelarVisita, programarVisitas } from "@/acciones/campo";
import { AreaTexto, BotonEnviar, Campo, Formulario } from "@/components/formulario";
import { ESTADO_INICIAL } from "@/lib/formulario";

const NIVEL = { critico: "Crítico", alto: "Alto" } as const;

/** Programa de trabajo: el auditor elige a qué proveedores se visita y quién va. */
export function ProgramaVisitas({
  encargoId,
  propuestas,
  verificadores,
}: {
  encargoId: string;
  propuestas: {
    entidad_id: string;
    nombre: string;
    rfc: string | null;
    nivel: string;
    puntaje: number;
  }[];
  verificadores: { usuario_id: string; correo: string; rol: string }[];
}) {
  const [estado, enviar] = useActionState(programarVisitas, ESTADO_INICIAL);
  const [marcados, setMarcados] = useState<Set<string>>(
    new Set(propuestas.filter((p) => p.nivel === "critico").map((p) => p.entidad_id)),
  );
  const id = useId();
  const errVerif = estado.errores?.verificador_id;
  const errEnt = estado.errores?.entidades;
  return (
    <form action={enviar} className="flex flex-col gap-4">
      <input type="hidden" name="encargo_id" value={encargoId} />
      {estado.mensaje ? (
        <p
          role={estado.ok ? "status" : "alert"}
          className={`rounded-md border px-3 py-2 text-sm ${estado.ok ? "border-ok/60 text-ok" : "border-peligro/60 text-peligro"}`}
        >
          {estado.mensaje}
        </p>
      ) : null}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm text-texto">
          Proveedores a visitar ({marcados.size} de {propuestas.length})
        </legend>
        <ul className="flex max-h-[24rem] flex-col gap-1 overflow-auto rounded-md border border-linea p-2">
          {propuestas.map((p, i) => (
            <li key={p.entidad_id}>
              <label htmlFor={`${id}-${i}`} className="flex items-start gap-2 text-sm text-texto">
                <input
                  id={`${id}-${i}`}
                  type="checkbox"
                  name="entidades"
                  value={p.entidad_id}
                  checked={marcados.has(p.entidad_id)}
                  onChange={(e) =>
                    setMarcados((m) => {
                      const n = new Set(m);
                      if (e.target.checked) n.add(p.entidad_id);
                      else n.delete(p.entidad_id);
                      return n;
                    })
                  }
                  className="mt-1"
                />
                <span>
                  {p.nombre}
                  <span className="block text-xs text-tenue">
                    {p.rfc ? `${p.rfc} · ` : ""}
                    {NIVEL[p.nivel as keyof typeof NIVEL] ?? p.nivel} · {p.puntaje} puntos
                  </span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {errEnt ? <p className="text-xs text-peligro">{errEnt.join(". ")}</p> : null}
      </fieldset>
      <div className="flex max-w-xl flex-col gap-1.5">
        <label htmlFor={`${id}-v`} className="text-sm text-texto">
          Quién hace la visita<span className="text-oro"> *</span>
        </label>
        <select
          id={`${id}-v`}
          name="verificador_id"
          defaultValue=""
          aria-invalid={errVerif ? true : undefined}
          aria-describedby={`${id}-v-ayuda`}
          className="w-full rounded-md border border-linea-2 bg-fondo-2 px-3 py-2 text-sm text-texto"
        >
          <option value="">Elige…</option>
          {verificadores.map((v) => (
            <option key={v.usuario_id} value={v.usuario_id}>
              {v.correo} · {NOMBRE_ROL[v.rol as Rol] ?? v.rol}
            </option>
          ))}
        </select>
        <p id={`${id}-v-ayuda`} className="text-xs text-tenue">
          Un auditor o un verificador de campo. El verificador solo ve las visitas que le asignas.
        </p>
        {errVerif ? <p className="text-xs text-peligro">{errVerif.join(". ")}</p> : null}
      </div>
      <div className="max-w-xl">
        <AreaTexto
          nombre="instrucciones"
          etiqueta="Instrucciones para la visita"
          ayuda="Opcional. Qué observar o a quién preguntar. No escribas datos reservados."
          estado={estado}
        />
      </div>
      <div>
        <BotonEnviar>Asignar visitas</BotonEnviar>
      </div>
    </form>
  );
}

export function CancelarVisita({ visitaId }: { visitaId: string }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer text-tenue">Cancelar visita</summary>
      <div className="mt-2">
        <Formulario
          accion={cancelarVisita}
          textoEnviar="Cancelar visita"
          ocultos={{ visita_id: visitaId }}
        >
          {(estado) => <Campo nombre="motivo" etiqueta="Motivo" estado={estado} requerido />}
        </Formulario>
      </div>
    </details>
  );
}
