"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { ESTADO_INICIAL, type EstadoFormulario } from "@/lib/formulario";

type Accion = (estado: EstadoFormulario, formData: FormData) => Promise<EstadoFormulario>;

/**
 * Formulario conectado a una server action. La validación con zod ocurre en el
 * servidor; aquí solo se muestran los errores por campo que devuelve.
 */
export function Formulario({
  accion,
  children,
  textoEnviar,
  ocultos,
}: {
  accion: Accion;
  children: (estado: EstadoFormulario) => ReactNode;
  textoEnviar: string;
  ocultos?: Record<string, string>;
}) {
  const [estado, enviar] = useActionState(accion, ESTADO_INICIAL);
  return (
    <form action={enviar} noValidate className="flex max-w-xl flex-col gap-5">
      {ocultos
        ? Object.entries(ocultos).map(([nombre, valor]) => (
            <input key={nombre} type="hidden" name={nombre} value={valor} />
          ))
        : null}
      {estado.mensaje ? (
        <p
          role={estado.ok ? "status" : "alert"}
          className={`rounded-md border px-3 py-2 text-sm ${
            estado.ok ? "border-ok/60 text-ok" : "border-peligro/60 text-peligro"
          }`}
        >
          {estado.mensaje}
        </p>
      ) : null}
      {children(estado)}
      <div>
        <BotonEnviar>{textoEnviar}</BotonEnviar>
      </div>
    </form>
  );
}

export function BotonEnviar({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-md bg-oro px-4 py-2 text-sm font-medium text-fondo hover:bg-oro-suave disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oro"
    >
      {pending ? "Guardando…" : children}
    </button>
  );
}

const claseControl =
  "w-full rounded-md border border-linea-2 bg-fondo-2 px-3 py-2 text-sm text-texto placeholder:text-tenue-2 focus:border-oro focus:outline-none aria-invalid:border-peligro";

type PropsCampo = {
  nombre: string;
  etiqueta: string;
  estado: EstadoFormulario;
  valor?: string | number | null;
  ayuda?: string;
  requerido?: boolean;
};

function Envoltura({
  nombre,
  etiqueta,
  ayuda,
  errores,
  requerido,
  children,
}: {
  nombre: string;
  etiqueta: string;
  ayuda?: string;
  errores?: string[];
  requerido?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={nombre} className="text-sm text-texto">
        {etiqueta}
        {requerido ? <span className="text-oro"> *</span> : null}
      </label>
      {children}
      {ayuda ? (
        <p id={`${nombre}-ayuda`} className="text-xs text-tenue">
          {ayuda}
        </p>
      ) : null}
      {errores?.length ? (
        <p id={`${nombre}-error`} className="text-xs text-peligro">
          {errores.join(". ")}
        </p>
      ) : null}
    </div>
  );
}

function valorInicial(p: PropsCampo): string {
  return p.estado.valores?.[p.nombre] ?? (p.valor == null ? "" : String(p.valor));
}

function describe(p: PropsCampo): string | undefined {
  const ids = [
    p.ayuda ? `${p.nombre}-ayuda` : null,
    p.estado.errores?.[p.nombre] ? `${p.nombre}-error` : null,
  ];
  const r = ids.filter(Boolean).join(" ");
  return r || undefined;
}

export function Campo(
  props: PropsCampo & { tipo?: "text" | "date" | "number" | "email" | "password"; paso?: string },
) {
  const errores = props.estado.errores?.[props.nombre];
  return (
    <Envoltura {...props} errores={errores}>
      <input
        id={props.nombre}
        name={props.nombre}
        type={props.tipo ?? "text"}
        step={props.paso}
        defaultValue={valorInicial(props)}
        key={valorInicial(props)}
        required={props.requerido}
        aria-invalid={errores ? true : undefined}
        aria-describedby={describe(props)}
        className={claseControl}
      />
    </Envoltura>
  );
}

export function AreaTexto(props: PropsCampo) {
  const errores = props.estado.errores?.[props.nombre];
  return (
    <Envoltura {...props} errores={errores}>
      <textarea
        id={props.nombre}
        name={props.nombre}
        rows={4}
        defaultValue={valorInicial(props)}
        key={valorInicial(props)}
        aria-invalid={errores ? true : undefined}
        aria-describedby={describe(props)}
        className={claseControl}
      />
    </Envoltura>
  );
}

export function Selector(
  props: PropsCampo & { opciones: { valor: string; texto: string }[]; vacio?: string },
) {
  const errores = props.estado.errores?.[props.nombre];
  return (
    <Envoltura {...props} errores={errores}>
      <select
        id={props.nombre}
        name={props.nombre}
        defaultValue={valorInicial(props)}
        key={valorInicial(props)}
        aria-invalid={errores ? true : undefined}
        aria-describedby={describe(props)}
        className={claseControl}
      >
        {props.vacio !== undefined ? <option value="">{props.vacio}</option> : null}
        {props.opciones.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.texto}
          </option>
        ))}
      </select>
    </Envoltura>
  );
}
