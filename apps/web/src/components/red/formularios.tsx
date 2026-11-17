"use client";

import { useActionState, useState } from "react";
import { ajustarNivel, generarRedAccion, guardarReglas } from "@/acciones/red";
import { BotonEnviar } from "@/components/formulario";
import { ESTADO_INICIAL } from "@/lib/formulario";

const claseControl =
  "rounded-md border border-linea-2 bg-fondo-2 px-3 py-2 text-sm text-texto focus:border-oro focus:outline-none";

function Mensaje({ ok, texto }: { ok: boolean; texto?: string }) {
  if (!texto) return null;
  return (
    <p role={ok ? "status" : "alert"} className={`text-sm ${ok ? "text-ok" : "text-peligro"}`}>
      {texto}
    </p>
  );
}

export function FormularioGenerar({
  encargoId,
  entidades,
}: {
  encargoId: string;
  entidades: { id: string; nombre: string; tipo: string }[];
}) {
  const [estado, enviar] = useActionState(generarRedAccion, ESTADO_INICIAL);
  const [todas, setTodas] = useState(true);
  return (
    <form action={enviar} className="flex flex-col gap-4">
      <input type="hidden" name="encargo_id" value={encargoId} />
      <label className="flex items-center gap-2 text-sm text-texto">
        <input
          type="checkbox"
          name="todas"
          value="1"
          checked={todas}
          onChange={(e) => setTodas(e.target.checked)}
        />
        Todas las entidades del encargo
      </label>
      {!todas ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor="semillas" className="text-sm text-texto">
            Entidades de partida
          </label>
          <select
            id="semillas"
            name="semillas"
            multiple
            size={8}
            className={`${claseControl} max-w-xl`}
          >
            {entidades.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre} · {e.tipo.replace("_", " ")}
              </option>
            ))}
          </select>
          <p className="text-xs text-tenue">
            La red se arma alrededor de estas entidades. Ctrl o ⌘ para elegir varias.
          </p>
        </div>
      ) : null}
      <fieldset className="flex items-center gap-4 text-sm text-texto" disabled={todas}>
        <legend className="mb-1 text-sm text-texto">Hasta dónde llega la red</legend>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="alcance" value="1" defaultChecked /> Solo relaciones directas
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" name="alcance" value="2" /> También las relaciones de sus relacionados
        </label>
      </fieldset>
      <Mensaje ok={estado.ok} texto={estado.mensaje} />
      <div>
        <BotonEnviar>Generar red</BotonEnviar>
      </div>
    </form>
  );
}

const NIVELES = [
  { valor: "critico", texto: "Crítico" },
  { valor: "alto", texto: "Alto" },
  { valor: "medio", texto: "Medio" },
  { valor: "bajo", texto: "Bajo" },
];

export function FormularioAjuste({
  calificacionId,
  nivelActual,
}: {
  calificacionId: string;
  nivelActual: string;
}) {
  const [estado, enviar] = useActionState(ajustarNivel, ESTADO_INICIAL);
  const [abierto, setAbierto] = useState(false);
  if (!abierto) {
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="text-xs text-azul-claro underline"
      >
        Ajustar
      </button>
    );
  }
  return (
    <form action={enviar} className="flex flex-col gap-1.5">
      <input type="hidden" name="calificacion_id" value={calificacionId} />
      <label className="sr-only" htmlFor={`nivel-${calificacionId}`}>
        Nivel ajustado
      </label>
      <select
        id={`nivel-${calificacionId}`}
        name="ajuste_nivel"
        defaultValue={nivelActual}
        className={`${claseControl} py-1 text-xs`}
      >
        {NIVELES.map((n) => (
          <option key={n.valor} value={n.valor}>
            {n.texto}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor={`motivo-${calificacionId}`}>
        Motivo del ajuste
      </label>
      <input
        id={`motivo-${calificacionId}`}
        name="ajuste_motivo"
        required
        placeholder="Motivo (obligatorio)"
        className={`${claseControl} py-1 text-xs`}
      />
      <Mensaje ok={estado.ok} texto={estado.mensaje} />
      <button
        type="submit"
        className="self-start rounded border border-oro px-2 py-0.5 text-xs text-oro"
      >
        Guardar ajuste
      </button>
    </form>
  );
}

export type ValoresReglas = Record<
  | "riesgo_critico"
  | "riesgo_alto"
  | "riesgo_medio"
  | "tipo_declarado"
  | "alertas_abiertas"
  | "vinculo_fuerte_con_critico"
  | "fuerza_minima"
  | "evento_con_etapa"
  | "fuerza_vinculo",
  number
> & { patron: string };

const CAMPOS_REGLAS: { clave: keyof ValoresReglas; etiqueta: string }[] = [
  { clave: "riesgo_critico", etiqueta: "Riesgo declarado CRÍTICO" },
  { clave: "riesgo_alto", etiqueta: "Riesgo declarado ALTO" },
  { clave: "riesgo_medio", etiqueta: "Riesgo declarado MEDIO" },
  { clave: "tipo_declarado", etiqueta: "Tipo fantasma, fachada u offshore" },
  { clave: "alertas_abiertas", etiqueta: "Por alerta abierta (R06–R10)" },
  { clave: "vinculo_fuerte_con_critico", etiqueta: "Vínculo fuerte con entidad crítica" },
  { clave: "fuerza_minima", etiqueta: "Fuerza mínima de «vínculo fuerte» (1–10)" },
  { clave: "evento_con_etapa", etiqueta: "Vínculo con evento en etapa o alerta" },
  { clave: "fuerza_vinculo", etiqueta: "Multiplicador de la fuerza del vínculo" },
];

export function FormularioReglas({
  valores,
  version,
}: {
  valores: ValoresReglas;
  version: number;
}) {
  const [estado, enviar] = useActionState(guardarReglas, ESTADO_INICIAL);
  return (
    <form action={enviar} className="flex flex-col gap-4">
      <p className="text-xs text-tenue">
        Versión vigente: {version === 0 ? "0 (valores provisionales de §9)" : version}. Guardar crea
        una versión nueva; las anteriores se conservan.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {CAMPOS_REGLAS.map((c) => (
          <label key={c.clave} className="flex flex-col gap-1 text-xs text-tenue">
            {c.etiqueta}
            <input
              name={c.clave}
              type="number"
              step="0.5"
              min={0}
              defaultValue={valores[c.clave]}
              className={claseControl}
            />
          </label>
        ))}
        <label className="flex flex-col gap-1 text-xs text-tenue sm:col-span-2">
          Tipos declarados que suman (expresión regular)
          <input name="patron" defaultValue={valores.patron} className={claseControl} />
        </label>
      </div>
      <Mensaje ok={estado.ok} texto={estado.mensaje} />
      <div>
        <BotonEnviar>Guardar nueva versión</BotonEnviar>
      </div>
    </form>
  );
}
