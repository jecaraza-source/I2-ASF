import type { Metadata, Viewport } from "next";
import Image from "next/image";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "SIGMA · Verificación en campo",
  manifest: "/campo.webmanifest",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a0e14",
};

/** App de campo: pantalla de celular, sin el menú de la plataforma. */
export default function LayoutCampo({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-12 flex-none items-center gap-2 border-b border-azul-borde bg-azul-profundo px-4">
        <Image
          src="/marca/escudo.png"
          alt="Escudo SIGMA"
          width={22}
          height={27}
          className="mix-blend-screen"
          priority
        />
        <span className="text-sm font-bold tracking-[0.5px] text-azul-claro">SIGMA</span>
        <span className="text-[10px] tracking-[2px] text-azul-medio uppercase">
          Verificación en campo
        </span>
      </header>
      <main id="contenido" className="flex flex-1 flex-col">
        {children}
      </main>
    </div>
  );
}
