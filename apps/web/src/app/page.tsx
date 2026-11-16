import Image from "next/image";

export default function Inicio() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex h-[58px] flex-none items-center gap-4 border-b border-azul-borde bg-linear-135 from-azul-profundo to-azul-header px-6 shadow-[0_2px_16px_rgba(0,0,0,0.6)]">
        <Image
          src="/marca/escudo.png"
          alt="Escudo SIGMA"
          width={38}
          height={47}
          className="flex-none mix-blend-screen"
          priority
        />
        <div>
          <p className="text-[15px] font-bold tracking-[0.5px] text-azul-claro">SIGMA</p>
          <p className="text-[9px] tracking-[2.5px] text-azul-medio uppercase">
            Integración de fuentes para auditoría
          </p>
        </div>
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-8 px-6 py-16 text-center">
        <Image
          src="/marca/logo.png"
          alt="Logo SIGMA"
          width={817}
          height={722}
          className="h-auto w-64 sm:w-80"
          priority
        />
        <div className="space-y-3">
          <h1 className="text-2xl font-bold tracking-wide text-texto sm:text-3xl">
            Plataforma SIGMA
          </h1>
          <p className="text-sm tracking-[2.5px] text-oro uppercase">
            Integración de fuentes para auditoría
          </p>
          <div className="mx-auto h-px w-24 bg-oro-tenue" />
          <p className="mx-auto max-w-xl text-sm text-tenue">
            Documentos y datos convertidos en registros trazables, ordenados en expedientes y
            analizados como una red de vínculos.
          </p>
        </div>
      </main>

      <footer className="border-t border-linea px-6 py-4 text-center text-xs text-tenue-2">
        SIGMA Inteligencia
      </footer>
    </div>
  );
}
