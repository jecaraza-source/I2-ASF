"use client";

import {
  DESCRIPCION_ROL,
  MIN_CONTRASENA,
  NOMBRE_ROL,
  type ModoAlta,
  type Rol,
} from "@sigma/modelo";
import { useActionState, useId, useState } from "react";
import { agregarUsuario, cambiarEstadoUsuario, cambiarRolUsuario } from "@/acciones/usuarios";
import { BotonEnviar } from "@/components/formulario";
import { ESTADO_INICIAL, type EstadoFormulario } from "@/lib/formulario";

const ROLES: Rol[] = ["admin", "auditor", "lector", "verificador"];
const claseControl =
  "w-full rounded-md border border-linea-2 bg-fondo-2 px-3 py-2 text-sm text-texto focus:border-oro focus:outline-none aria-invalid:border-peligro";
const claseBotonFila =
  "rounded-md border border-linea-2 px-2.5 py-1 text-xs text-texto hover:border-oro focus-visible:outline-2 focus-visible:outline-oro disabled:opacity-50";

function Aviso({ estado }: { estado: EstadoFormulario }) {
  if (!estado.mensaje) return null;
  return (
    <p
      role={estado.ok ? "status" : "alert"}
      className={`rounded-md border px-3 py-2 text-sm ${
        estado.ok ? "border-ok/60 text-ok" : "border-peligro/60 text-peligro"
      }`}
    >
      {estado.mensaje}
    </p>
  );
}

function ErrorCampo({ id, errores }: { id: string; errores?: string[] }) {
  return errores?.length ? (
    <p id={id} className="text-xs text-peligro">
      {errores.join(". ")}
    </p>
  ) : null;
}

export function FormularioAltaUsuario() {
  const [estado, enviar] = useActionState(agregarUsuario, ESTADO_INICIAL);
  // Controlados: React 19 limpia los formularios no controlados después de cada envío.
  const [correo, setCorreo] = useState("");
  const [rol, setRol] = useState<Rol>("auditor");
  const [modo, setModo] = useState<ModoAlta>("invitacion");
  const [contrasena, setContrasena] = useState("");
  const [enviado, setEnviado] = useState<EstadoFormulario>(ESTADO_INICIAL);
  if (estado !== enviado) {
    setEnviado(estado);
    if (estado.ok) {
      setCorreo("");
      setContrasena("");
    }
  }
  const id = useId();
  return (
    <form action={enviar} noValidate className="flex max-w-2xl flex-col gap-4">
      <Aviso estado={estado} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-correo`} className="text-sm text-texto">
            Correo del usuario <span className="text-oro">*</span>
          </label>
          <input
            id={`${id}-correo`}
            name="correo"
            type="email"
            autoComplete="off"
            value={correo}
            onChange={(e) => setCorreo(e.target.value)}
            aria-invalid={estado.errores?.correo ? true : undefined}
            aria-describedby={estado.errores?.correo ? `${id}-correo-error` : undefined}
            className={claseControl}
          />
          <ErrorCampo id={`${id}-correo-error`} errores={estado.errores?.correo} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-rol`} className="text-sm text-texto">
            Rol
          </label>
          <select
            id={`${id}-rol`}
            name="rol"
            value={rol}
            onChange={(e) => setRol(e.target.value as Rol)}
            aria-describedby={`${id}-rol-ayuda`}
            className={claseControl}
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {NOMBRE_ROL[r]}
              </option>
            ))}
          </select>
          <p id={`${id}-rol-ayuda`} className="text-xs text-tenue">
            {DESCRIPCION_ROL[rol]}
          </p>
        </div>
      </div>
      <fieldset className="flex flex-col gap-2 text-sm text-texto">
        <legend className="mb-1 text-sm text-texto">Cómo recibe su acceso</legend>
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="modo"
            value="invitacion"
            checked={modo === "invitacion"}
            onChange={() => setModo("invitacion")}
            className="mt-1"
          />
          <span>
            Invitación por correo
            <span className="block text-xs text-tenue">
              Recibe un enlace y define su propia contraseña.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input
            type="radio"
            name="modo"
            value="temporal"
            checked={modo === "temporal"}
            onChange={() => setModo("temporal")}
            className="mt-1"
          />
          <span>
            Contraseña temporal
            <span className="block text-xs text-tenue">
              Tú la defines y se la entregas; debe cambiarla al entrar.
            </span>
          </span>
        </label>
      </fieldset>
      {modo === "temporal" ? (
        <div className="flex max-w-sm flex-col gap-1.5">
          <label htmlFor={`${id}-contrasena`} className="text-sm text-texto">
            Contraseña temporal <span className="text-oro">*</span>
          </label>
          <input
            id={`${id}-contrasena`}
            name="contrasena"
            type="password"
            autoComplete="new-password"
            value={contrasena}
            onChange={(e) => setContrasena(e.target.value)}
            aria-invalid={estado.errores?.contrasena ? true : undefined}
            aria-describedby={`${id}-contrasena-ayuda`}
            className={claseControl}
          />
          <p id={`${id}-contrasena-ayuda`} className="text-xs text-tenue">
            Mínimo {MIN_CONTRASENA} caracteres. No se guarda ni se muestra después.
          </p>
          <ErrorCampo id={`${id}-contrasena-error`} errores={estado.errores?.contrasena} />
        </div>
      ) : null}
      <div>
        <BotonEnviar>Agregar usuario</BotonEnviar>
      </div>
    </form>
  );
}

/** Rol y estado de un usuario, en su fila. */
export function AccionesUsuario({
  miembroId,
  correo,
  rol,
  activo,
  esPropio,
}: {
  miembroId: string;
  correo: string;
  rol: Rol;
  activo: boolean;
  esPropio: boolean;
}) {
  const [estadoRol, enviarRol, guardandoRol] = useActionState(cambiarRolUsuario, ESTADO_INICIAL);
  const [estadoBaja, enviarBaja, guardandoBaja] = useActionState(
    cambiarEstadoUsuario,
    ESTADO_INICIAL,
  );
  const [elegido, setElegido] = useState<Rol>(rol);
  const [rolBase, setRolBase] = useState<Rol>(rol);
  if (rol !== rolBase) {
    setRolBase(rol);
    setElegido(rol);
  }
  if (esPropio) {
    return <p className="text-xs text-tenue">Tu propio acceso lo cambia otro administrador.</p>;
  }
  const ultimo = [estadoBaja, estadoRol].find((e) => e.mensaje);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {activo ? (
          <form action={enviarRol} className="flex items-center gap-2">
            <input type="hidden" name="miembro_id" value={miembroId} />
            <select
              name="rol"
              aria-label={`Rol de ${correo}`}
              value={elegido}
              onChange={(e) => setElegido(e.target.value as Rol)}
              className="rounded-md border border-linea-2 bg-fondo-2 px-2 py-1 text-xs text-texto focus:border-oro focus:outline-none"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {NOMBRE_ROL[r]}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={guardandoRol || elegido === rol}
              aria-label={`Guardar rol de ${correo}`}
              className={claseBotonFila}
            >
              Guardar rol
            </button>
          </form>
        ) : null}
        <form action={enviarBaja}>
          <input type="hidden" name="miembro_id" value={miembroId} />
          <input type="hidden" name="activo" value={activo ? "false" : "true"} />
          <button
            type="submit"
            disabled={guardandoBaja}
            aria-label={`${activo ? "Dar de baja a" : "Reactivar a"} ${correo}`}
            className={`${claseBotonFila} ${activo ? "hover:border-peligro hover:text-peligro" : ""}`}
          >
            {activo ? "Dar de baja" : "Reactivar"}
          </button>
        </form>
      </div>
      {ultimo?.mensaje ? (
        <p
          role={ultimo.ok ? "status" : "alert"}
          className={`text-xs ${ultimo.ok ? "text-ok" : "text-peligro"}`}
        >
          {ultimo.mensaje}
        </p>
      ) : null}
    </div>
  );
}
