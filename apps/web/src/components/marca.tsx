import Image from "next/image";
import Link from "next/link";

export function BarraMarca({
  children,
  centro,
}: {
  children?: React.ReactNode;
  /** Contenido entre la marca y la zona del usuario (el menú de módulos). */
  centro?: React.ReactNode;
}) {
  return (
    <header className="sticky top-0 z-20 flex h-[58px] flex-none items-center gap-3 border-b border-azul-borde bg-linear-135 from-azul-profundo to-azul-header px-3 shadow-[0_2px_16px_rgba(0,0,0,0.6)] md:static md:gap-4 md:px-6">
      <Link href="/encargos" className="flex items-center gap-3">
        <Image
          src="/marca/escudo.png"
          alt="Escudo SIGMA"
          width={34}
          height={42}
          className="mix-blend-screen"
          priority
        />
        <span>
          <span className="block text-[15px] font-bold tracking-[0.5px] text-azul-claro">
            SIGMA
          </span>
          <span className="hidden text-[9px] tracking-[2.5px] text-azul-medio uppercase sm:block">
            Integración de fuentes para auditoría
          </span>
        </span>
      </Link>
      {centro}
      <div className="ml-auto">{children}</div>
    </header>
  );
}
