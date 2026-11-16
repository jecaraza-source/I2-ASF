"use client";

import { NOMBRE_PROVEEDOR_IA, PROVEEDORES_IA, type ProveedorIA } from "@sigma/modelo";
import { useActionState } from "react";
import { configurarIAEncargo, guardarConfiguracionIA, guardarPrecioIA } from "@/acciones/ia";
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

export function FormularioConfiguracionIA({
  activa,
  topeDiario,
  topeMensual,
}: {
  activa: boolean;
  topeDiario: number;
  topeMensual: number;
}) {
  const [estado, enviar] = useActionState(guardarConfiguracionIA, ESTADO_INICIAL);
  return (
    <form action={enviar} className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-sm text-texto">
        <input type="checkbox" name="activa" defaultChecked={activa} className="size-4" />
        IA activa en la organización
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-xs text-tenue">
          Tope diario de tokens
          <input
            name="tope_diario_tokens"
            defaultValue={topeDiario}
            inputMode="numeric"
            className={claseControl}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-tenue">
          Tope mensual de tokens
          <input
            name="tope_mensual_tokens"
            defaultValue={topeMensual}
            inputMode="numeric"
            className={claseControl}
          />
        </label>
      </div>
      <p className="text-xs text-tenue">
        Al llegar a un tope, las llamadas se bloquean y los documentos esperan en la cola; nada se
        pierde. El día y el mes se cuentan con la hora de México.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <BotonEnviar>Guardar configuración</BotonEnviar>
        <Mensaje ok={estado.ok} texto={estado.mensaje} />
      </div>
    </form>
  );
}

export function FormularioPrecioIA() {
  const [estado, enviar] = useActionState(guardarPrecioIA, ESTADO_INICIAL);
  return (
    <form action={enviar} className="flex flex-col gap-3">
      <div className="grid gap-3 sm:grid-cols-[11rem_minmax(0,1fr)_9rem_9rem]">
        <label className="flex flex-col gap-1 text-xs text-tenue">
          Proveedor
          <select name="proveedor" className={claseControl}>
            {PROVEEDORES_IA.map((p) => (
              <option key={p} value={p}>
                {NOMBRE_PROVEEDOR_IA[p]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-tenue">
          Modelo
          <input name="modelo" placeholder="nombre exacto del modelo" className={claseControl} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-tenue">
          USD por millón (entrada)
          <input name="usd_millon_entrada" inputMode="decimal" className={claseControl} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-tenue">
          USD por millón (salida)
          <input name="usd_millon_salida" inputMode="decimal" className={claseControl} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <BotonEnviar>Guardar precio</BotonEnviar>
        <Mensaje ok={estado.ok} texto={estado.mensaje} />
      </div>
    </form>
  );
}

export function FormularioIAEncargo({
  encargoId,
  nombre,
  proveedores,
}: {
  encargoId: string;
  nombre: string;
  proveedores: ProveedorIA[];
}) {
  const [estado, enviar] = useActionState(configurarIAEncargo, ESTADO_INICIAL);
  return (
    <form action={enviar} className="flex flex-col gap-2">
      <input type="hidden" name="encargo_id" value={encargoId} />
      <fieldset className="flex flex-wrap items-center gap-x-5 gap-y-1">
        <legend className="sr-only">Proveedores de IA permitidos en {nombre}</legend>
        {PROVEEDORES_IA.map((p) => (
          <label key={p} className="flex items-center gap-2 text-sm text-texto">
            <input
              type="checkbox"
              name="proveedores"
              value={p}
              defaultChecked={proveedores.includes(p)}
              aria-label={`${NOMBRE_PROVEEDOR_IA[p]} en ${nombre}`}
              className="size-4"
            />
            {NOMBRE_PROVEEDOR_IA[p]}
          </label>
        ))}
        <button
          type="submit"
          aria-label={`Guardar IA de ${nombre}`}
          className="rounded-md border border-linea-2 px-2.5 py-1 text-xs text-texto hover:border-oro"
        >
          Guardar
        </button>
      </fieldset>
      <Mensaje ok={estado.ok} texto={estado.mensaje} />
    </form>
  );
}
