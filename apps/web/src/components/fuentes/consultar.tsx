"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { consultarFuentes } from "@/acciones/fuentes";

/**
 * Encola la consulta de fuentes (una entidad o todo el encargo) y refresca la página unas veces
 * mientras el trabajo corre en segundo plano.
 */
export function BotonConsultarFuentes({
  encargoId,
  entidadId,
  texto,
  variante = "secundario",
}: {
  encargoId: string;
  entidadId?: string;
  texto: string;
  variante?: "primario" | "secundario";
}) {
  const router = useRouter();
  const [enviando, iniciar] = useTransition();
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [refrescos, setRefrescos] = useState(0);

  useEffect(() => {
    if (refrescos <= 0) return;
    const t = setTimeout(() => {
      router.refresh();
      setRefrescos((n) => n - 1);
    }, 3000);
    return () => clearTimeout(t);
  }, [refrescos, router]);

  return (
    <div className="flex flex-col items-start gap-1.5">
      <button
        type="button"
        disabled={enviando}
        onClick={() =>
          iniciar(async () => {
            const r = await consultarFuentes(encargoId, entidadId);
            setAviso({ ok: r.ok, texto: r.mensaje ?? "" });
            if (r.ok) setRefrescos(entidadId ? 5 : 10);
          })
        }
        className={
          variante === "primario"
            ? "rounded-md bg-oro px-3.5 py-2 text-sm font-medium text-fondo hover:bg-oro-suave disabled:opacity-60"
            : "rounded-md border border-linea-2 px-3.5 py-2 text-sm text-texto hover:border-oro disabled:opacity-60"
        }
      >
        {enviando ? "Encolando…" : texto}
      </button>
      {aviso ? (
        <p
          role={aviso.ok ? "status" : "alert"}
          className={`text-xs ${aviso.ok ? "text-tenue" : "text-peligro"}`}
        >
          {aviso.texto}
        </p>
      ) : null}
    </div>
  );
}
