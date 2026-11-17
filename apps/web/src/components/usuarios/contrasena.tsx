"use client";

import { MIN_CONTRASENA, contrasenaSchema } from "@sigma/modelo";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState, type FormEvent } from "react";
import { registrarAccesoPorEnlace } from "@/acciones/sesion";
import { clienteNavegador } from "@/lib/supabase/navegador";

type Estado =
  | { fase: "cargando" }
  | { fase: "lista"; correo: string; porEnlace: boolean }
  | { fase: "sin_sesion"; motivo: "sin_sesion" | "enlace" };

const claseControl =
  "w-full rounded-md border border-linea-2 bg-fondo-2 px-3 py-2 text-sm text-texto focus:border-oro focus:outline-none aria-invalid:border-peligro";

/**
 * La sesión de una invitación llega en el fragmento del enlace (#access_token…) o como
 * `token_hash` en la consulta; se canjea aquí y se borra de la barra de direcciones.
 */
async function resolverSesion(): Promise<Estado> {
  const supabase = clienteNavegador();
  const fragmento = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const consulta = new URLSearchParams(window.location.search);
  const limpiar = () => window.history.replaceState(null, "", window.location.pathname);

  if (fragmento.get("error") || consulta.get("error")) {
    limpiar();
    return { fase: "sin_sesion", motivo: "enlace" };
  }
  const acceso = fragmento.get("access_token");
  const refresco = fragmento.get("refresh_token");
  if (acceso && refresco) {
    limpiar();
    const { data, error } = await supabase.auth.setSession({
      access_token: acceso,
      refresh_token: refresco,
    });
    if (error || !data.user) return { fase: "sin_sesion", motivo: "enlace" };
    return { fase: "lista", correo: data.user.email ?? "", porEnlace: true };
  }
  const huella = consulta.get("token_hash");
  const tipo = consulta.get("type");
  if (huella && (tipo === "invite" || tipo === "recovery")) {
    limpiar();
    const { data, error } = await supabase.auth.verifyOtp({ token_hash: huella, type: tipo });
    if (error || !data.user) return { fase: "sin_sesion", motivo: "enlace" };
    return { fase: "lista", correo: data.user.email ?? "", porEnlace: true };
  }
  const { data } = await supabase.auth.getUser();
  if (!data.user) return { fase: "sin_sesion", motivo: "sin_sesion" };
  return { fase: "lista", correo: data.user.email ?? "", porEnlace: false };
}

export function FormularioContrasena() {
  const [estado, setEstado] = useState<Estado>({ fase: "cargando" });
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const id = useId();
  const router = useRouter();

  useEffect(() => {
    let vivo = true;
    void resolverSesion().then((e) => {
      if (vivo) setEstado(e);
    });
    return () => {
      vivo = false;
    };
  }, []);

  if (estado.fase === "cargando") {
    return (
      <p role="status" className="text-sm text-tenue">
        Verificando tu acceso…
      </p>
    );
  }
  if (estado.fase === "sin_sesion") {
    return (
      <div className="flex flex-col gap-3 text-sm">
        <p role="alert" className="text-texto">
          {estado.motivo === "enlace"
            ? "El enlace ya se usó o venció. Pide al administrador de tu organización que te invite de nuevo."
            : "Para cambiar tu contraseña primero inicia sesión."}
        </p>
        <Link href="/ingresar" className="text-azul-claro underline">
          Ir a iniciar sesión
        </Link>
      </div>
    );
  }

  const guardar = async (ev: FormEvent) => {
    ev.preventDefault();
    const valida = contrasenaSchema.safeParse(nueva);
    if (!valida.success) {
      setError(valida.error.issues[0]?.message ?? "Contraseña inválida");
      return;
    }
    if (nueva !== repetida) {
      setError("Las dos contraseñas no coinciden");
      return;
    }
    setError(null);
    setGuardando(true);
    const { error: fallo } = await clienteNavegador().auth.updateUser({ password: nueva });
    if (fallo) {
      setGuardando(false);
      setError(
        fallo.code === "same_password"
          ? "Usa una contraseña distinta a la actual."
          : "No se pudo guardar la contraseña. Intenta de nuevo.",
      );
      return;
    }
    if (estado.porEnlace) await registrarAccesoPorEnlace();
    router.replace("/encargos");
    router.refresh();
  };

  return (
    <form onSubmit={guardar} noValidate className="flex flex-col gap-4">
      <div>
        <h1 className="text-lg font-semibold text-texto">
          {estado.porEnlace ? "Define tu contraseña" : "Cambiar mi contraseña"}
        </h1>
        <p className="mt-1 text-xs text-tenue">{estado.correo}</p>
      </div>
      {error ? (
        <p
          role="alert"
          className="rounded-md border border-peligro/60 px-3 py-2 text-sm text-peligro"
        >
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-nueva`} className="text-sm text-texto">
          Contraseña nueva
        </label>
        <input
          id={`${id}-nueva`}
          type="password"
          autoComplete="new-password"
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
          aria-describedby={`${id}-ayuda`}
          className={claseControl}
        />
        <p id={`${id}-ayuda`} className="text-xs text-tenue">
          Mínimo {MIN_CONTRASENA} caracteres.
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-repetida`} className="text-sm text-texto">
          Repite la contraseña
        </label>
        <input
          id={`${id}-repetida`}
          type="password"
          autoComplete="new-password"
          value={repetida}
          onChange={(e) => setRepetida(e.target.value)}
          className={claseControl}
        />
      </div>
      <button
        type="submit"
        disabled={guardando}
        className="rounded-md bg-oro px-3.5 py-2 text-sm font-medium text-fondo hover:bg-oro-suave disabled:opacity-60"
      >
        {guardando ? "Guardando…" : "Guardar contraseña"}
      </button>
      {!estado.porEnlace ? (
        <Link href="/encargos" className="text-center text-xs text-azul-claro underline">
          Cancelar
        </Link>
      ) : null}
    </form>
  );
}
