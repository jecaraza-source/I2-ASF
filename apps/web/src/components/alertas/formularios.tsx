"use client";

import { useActionState } from "react";
import { ejecutarReglasAccion, resolverAlertaAccion } from "@/acciones/alertas";
import { BotonEnviar } from "@/components/formulario";
import { ESTADO_INICIAL } from "@/lib/formulario";

function Mensaje({ ok, texto }: { ok: boolean; texto?: string }) {
  if (!texto) return null;
  return (
    <p role={ok ? "status" : "alert"} className={`text-sm ${ok ? "text-ok" : "text-peligro"}`}>
      {texto}
    </p>
  );
}

export function FormularioEjecutarReglas({ encargoId }: { encargoId: string }) {
  const [estado, enviar] = useActionState(ejecutarReglasAccion, ESTADO_INICIAL);
  return (
    <form action={enviar} className="flex flex-wrap items-center gap-3">
      <input type="hidden" name="encargo_id" value={encargoId} />
      <BotonEnviar>Ejecutar reglas</BotonEnviar>
      <Mensaje ok={estado.ok} texto={estado.mensaje} />
    </form>
  );
}

export function FormularioResolver({
  encargoId,
  alertaId,
}: {
  encargoId: string;
  alertaId: string;
}) {
  const [estado, enviar] = useActionState(resolverAlertaAccion, ESTADO_INICIAL);
  return (
    <form action={enviar} className="flex flex-col gap-3">
      <input type="hidden" name="encargo_id" value={encargoId} />
      <input type="hidden" name="alerta_id" value={alertaId} />
      <label className="flex flex-col gap-1 text-sm text-texto">
        Motivo
        <textarea
          name="motivo"
          required
          minLength={3}
          maxLength={1000}
          rows={3}
          className="rounded-md border border-linea-2 bg-fondo-2 px-3 py-2 text-sm text-texto focus:border-oro focus:outline-none"
        />
      </label>
      <p className="text-xs text-tenue">
        Confirmar una alerta no crea un hallazgo: el hallazgo lo redacta y firma un auditor.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="estado"
          value="confirmada"
          className="rounded-md bg-oro px-3.5 py-2 text-sm font-medium text-fondo hover:bg-oro-suave"
        >
          Confirmar alerta
        </button>
        <button
          type="submit"
          name="estado"
          value="descartada"
          className="rounded-md border border-linea-2 px-3.5 py-2 text-sm text-texto hover:border-oro"
        >
          Descartar alerta
        </button>
      </div>
      <Mensaje ok={estado.ok} texto={estado.mensaje} />
    </form>
  );
}
