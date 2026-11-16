"use client";

import { useSearchParams } from "next/navigation";
import { iniciarSesion } from "@/acciones/sesion";
import { Campo, Formulario } from "@/components/formulario";

export function FormularioIngreso() {
  const siguiente = useSearchParams().get("siguiente") ?? "";
  return (
    <Formulario accion={iniciarSesion} textoEnviar="Ingresar" ocultos={{ siguiente }}>
      {(estado) => (
        <>
          <Campo nombre="email" etiqueta="Correo" tipo="email" estado={estado} requerido />
          <Campo
            nombre="password"
            etiqueta="Contraseña"
            tipo="password"
            estado={{ ...estado, valores: {} }}
            requerido
          />
        </>
      )}
    </Formulario>
  );
}
