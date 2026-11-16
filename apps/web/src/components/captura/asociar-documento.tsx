"use client";

import { EXTENSIONES_ACEPTADAS, MAX_BYTES_DOCUMENTO, tipoPorNombre } from "@sigma/modelo";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { asociarDocumento } from "@/acciones/ingreso";
import { huellaDe, subirOriginal } from "@/components/ingreso/subir";

/** Sube un archivo y lo liga a una captura «sin soporte documental». */
export function AsociarDocumento({
  encargoId,
  registroId,
}: {
  encargoId: string;
  registroId: string;
}) {
  const router = useRouter();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [mensaje, setMensaje] = useState("");
  const [ocupado, iniciar] = useTransition();

  const asociar = () =>
    iniciar(async () => {
      if (!archivo) return;
      if (!tipoPorNombre(archivo.name)) return setMensaje("Tipo de archivo no aceptado.");
      if (archivo.size === 0 || archivo.size > MAX_BYTES_DOCUMENTO)
        return setMensaje("El archivo está vacío o supera 50 MB.");
      setMensaje("");
      const sha256 = await huellaDe(archivo);
      const subida = await subirOriginal(encargoId, archivo, sha256);
      if (!subida.ok) return setMensaje(subida.mensaje);
      const r = await asociarDocumento({ encargoId, registroId, sha256, nombre: archivo.name });
      if (!r.ok) return setMensaje(r.mensaje);
      router.refresh();
    });

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-tenue">
        Este registro se capturó a mano. Asóciale el documento que lo respalda; al hacerlo se encola
        su lectura.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <input
          type="file"
          aria-label="Documento de soporte"
          accept={EXTENSIONES_ACEPTADAS}
          disabled={ocupado}
          onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
          className="text-sm text-texto file:mr-3 file:rounded-md file:border file:border-linea-2 file:bg-fondo-2 file:px-3 file:py-1.5 file:text-sm file:text-texto"
        />
        <button
          type="button"
          onClick={asociar}
          disabled={!archivo || ocupado}
          className="rounded-md bg-oro px-3.5 py-2 text-sm font-medium text-fondo hover:bg-oro-suave disabled:opacity-50"
        >
          {ocupado ? "Asociando…" : "Asociar documento"}
        </button>
      </div>
      {mensaje ? (
        <p role="alert" className="text-sm text-peligro">
          {mensaje}
        </p>
      ) : null}
    </div>
  );
}
