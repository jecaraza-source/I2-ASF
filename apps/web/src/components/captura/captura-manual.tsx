"use client";

import { useRouter } from "next/navigation";
import { capturarRegistro } from "@/acciones/captura";
import {
  FormularioRegistro,
  type EntidadConocida,
  type TipoParaCaptura,
} from "./formulario-registro";

/** Formulario de captura conectado a su acción; al guardar abre el registro creado. */
export function CapturaManual(props: {
  encargoId: string;
  tipos: TipoParaCaptura[];
  expedientes: { id: string; nombre: string }[];
  entidades: EntidadConocida[];
}) {
  const router = useRouter();
  return (
    <FormularioRegistro
      {...props}
      guardar={capturarRegistro}
      alGuardar={(registroId) =>
        router.push(`/encargos/${props.encargoId}/registros/${registroId}`)
      }
    />
  );
}
