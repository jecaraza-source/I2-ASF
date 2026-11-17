"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { capturarRegistro } from "@/acciones/captura";
import {
  FormularioRegistro,
  type EntidadConocida,
  type TipoParaCaptura,
} from "./formulario-registro";

/**
 * Formulario de captura conectado a su acción; al guardar abre el registro creado.
 *
 * Next conserva el estado de las páginas ya visitadas: sin reiniciar el formulario, al volver a
 * Captura manual aparecerían los datos de la captura anterior y se podría guardar un duplicado.
 */
export function CapturaManual(props: {
  encargoId: string;
  tipos: TipoParaCaptura[];
  expedientes: { id: string; nombre: string }[];
  entidades: EntidadConocida[];
}) {
  const router = useRouter();
  const [vuelta, setVuelta] = useState(0);
  return (
    <FormularioRegistro
      key={vuelta}
      {...props}
      guardar={capturarRegistro}
      alGuardar={(registroId) => {
        setVuelta((n) => n + 1);
        router.push(`/encargos/${props.encargoId}/registros/${registroId}`);
      }}
    />
  );
}
