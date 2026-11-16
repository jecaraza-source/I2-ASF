"use client";

import { guardarExpediente } from "@/acciones/encargos";
import { AreaTexto, Campo, Formulario } from "@/components/formulario";

type Inicial = {
  id: string;
  numero_control: string | null;
  identificador: string;
  descripcion: string | null;
};

export function FormularioExpediente({
  encargoId,
  expediente,
}: {
  encargoId: string;
  expediente?: Inicial;
}) {
  return (
    <Formulario
      accion={guardarExpediente}
      textoEnviar={expediente ? "Guardar cambios" : "Crear expediente"}
      ocultos={{ encargo_id: encargoId, ...(expediente ? { id: expediente.id } : {}) }}
    >
      {(estado) => (
        <>
          <Campo
            nombre="identificador"
            etiqueta="Identificador"
            estado={estado}
            valor={expediente?.identificador}
            ayuda={
              expediente
                ? "Déjalo como está o cámbialo por el número oficial."
                : "Déjalo vacío para generar EXP-AAAA-NNNN."
            }
          />
          <Campo
            nombre="numero_control"
            etiqueta="Número de control"
            estado={estado}
            valor={expediente?.numero_control}
            ayuda="Si aún no se conoce, déjalo vacío."
          />
          <AreaTexto
            nombre="descripcion"
            etiqueta="Descripción"
            estado={estado}
            valor={expediente?.descripcion}
          />
        </>
      )}
    </Formulario>
  );
}
