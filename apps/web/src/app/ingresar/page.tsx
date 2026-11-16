import Image from "next/image";
import { Suspense } from "react";
import { FormularioIngreso } from "@/components/formularios/ingreso";

export const metadata = { title: "Ingresar — SIGMA" };

export default function Ingresar() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-8 px-6 py-16">
      <Image
        src="/marca/logo.png"
        alt="Logo SIGMA"
        width={817}
        height={722}
        className="h-auto w-44"
        priority
      />
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-wide text-texto">Plataforma SIGMA</h1>
        <p className="mt-2 text-xs tracking-[2.5px] text-oro uppercase">
          Integración de fuentes para auditoría
        </p>
      </div>
      <div className="w-full max-w-sm rounded-lg border border-linea bg-panel p-6">
        <Suspense>
          <FormularioIngreso />
        </Suspense>
        <p className="mt-4 text-xs text-tenue">
          El acceso es por invitación del administrador de tu organización.
        </p>
      </div>
    </main>
  );
}
