import Image from "next/image";
import { FormularioContrasena } from "@/components/usuarios/contrasena";

export const metadata = { title: "Contraseña — SIGMA" };

/**
 * Definir o cambiar la contraseña. Llegan aquí: quien abre el enlace de una invitación (la sesión
 * viene en el enlace) y quien ya tiene sesión y quiere cambiarla.
 */
export default function PaginaContrasena() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 py-16">
      <Image
        src="/marca/logo.png"
        alt="Logo SIGMA"
        width={817}
        height={722}
        className="h-auto w-32"
        priority
      />
      <div className="w-full max-w-sm rounded-lg border border-linea bg-panel p-6">
        <FormularioContrasena />
      </div>
    </main>
  );
}
