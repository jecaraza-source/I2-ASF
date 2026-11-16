"use client";

import { guardarEncargo } from "@/acciones/encargos";
import { Campo, Formulario, Selector } from "@/components/formulario";

type Inicial = {
  id: string;
  nombre: string;
  tipo_auditoria: string | null;
  umbral_confianza: number;
  periodo_inicio: string | null;
  periodo_fin: string | null;
  estado: string;
};

export function FormularioEncargo({ encargo }: { encargo?: Inicial }) {
  return (
    <Formulario
      accion={guardarEncargo}
      textoEnviar={encargo ? "Guardar cambios" : "Crear encargo"}
      ocultos={encargo ? { id: encargo.id } : undefined}
    >
      {(estado) => (
        <>
          <Campo
            nombre="nombre"
            etiqueta="Nombre"
            estado={estado}
            valor={encargo?.nombre}
            requerido
          />
          <Campo
            nombre="tipo_auditoria"
            etiqueta="Tipo de auditoría"
            estado={estado}
            valor={encargo?.tipo_auditoria}
            ayuda="Por ejemplo: forense, cumplimiento, obra pública."
          />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Campo
              nombre="periodo_inicio"
              etiqueta="Inicio del periodo"
              tipo="date"
              estado={estado}
              valor={encargo?.periodo_inicio}
            />
            <Campo
              nombre="periodo_fin"
              etiqueta="Fin del periodo"
              tipo="date"
              estado={estado}
              valor={encargo?.periodo_fin}
            />
          </div>
          <Campo
            nombre="umbral_confianza"
            etiqueta="Umbral de confianza de la IA"
            tipo="number"
            paso="0.01"
            estado={estado}
            valor={encargo?.umbral_confianza ?? 0.85}
            ayuda="Entre 0 y 1. Las extracciones por debajo requieren validación humana."
          />
          {encargo ? (
            <Selector
              nombre="estado"
              etiqueta="Estado"
              estado={estado}
              valor={encargo.estado}
              opciones={[
                { valor: "activo", texto: "Activo" },
                { valor: "cerrado", texto: "Cerrado" },
                { valor: "archivado", texto: "Archivado" },
              ]}
            />
          ) : null}
        </>
      )}
    </Formulario>
  );
}
