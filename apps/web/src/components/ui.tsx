import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function Titulo({ children, accion }: { children: ReactNode; accion?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <h1 className="text-xl font-semibold text-texto">{children}</h1>
      {accion}
    </div>
  );
}

const claseBoton =
  "inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-oro";

export function EnlaceBoton({
  variante = "primario",
  className,
  ...props
}: ComponentProps<typeof Link> & { variante?: "primario" | "secundario" }) {
  const estilo =
    variante === "primario"
      ? "bg-oro text-fondo hover:bg-oro-suave"
      : "border border-linea-2 text-texto hover:border-oro";
  return <Link {...props} className={`${claseBoton} ${estilo} ${className ?? ""}`} />;
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-lg border border-linea bg-panel p-5 ${className ?? ""}`}>
      {children}
    </section>
  );
}

export function Etiqueta({
  children,
  tono = "neutro",
}: {
  children: ReactNode;
  tono?: "neutro" | "oro" | "ok";
}) {
  const estilo =
    tono === "oro"
      ? "border-oro-tenue text-oro"
      : tono === "ok"
        ? "border-ok/60 text-ok"
        : "border-linea-2 text-tenue";
  return (
    <span className={`inline-block rounded border px-1.5 py-0.5 text-xs ${estilo}`}>
      {children}
    </span>
  );
}
