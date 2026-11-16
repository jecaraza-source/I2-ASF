"use client";

import { guardarCategoria, guardarTipoDocumento } from "@/acciones/catalogo";
import { Campo, Formulario, Selector } from "@/components/formulario";

export function FormularioCategoria({
  encargoId,
  categoria,
}: {
  encargoId: string;
  categoria?: { id: string; nombre: string; orden: number };
}) {
  return (
    <Formulario
      accion={guardarCategoria}
      textoEnviar={categoria ? "Guardar cambios" : "Agregar categoría"}
      ocultos={{ encargo_id: encargoId, ...(categoria ? { id: categoria.id } : {}) }}
    >
      {(estado) => (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-[1fr_8rem]">
          <Campo
            nombre="nombre"
            etiqueta="Nombre de la categoría"
            estado={estado}
            valor={categoria?.nombre}
            requerido
          />
          <Campo
            nombre="orden"
            etiqueta="Orden"
            tipo="number"
            estado={estado}
            valor={categoria?.orden}
          />
        </div>
      )}
    </Formulario>
  );
}

export function FormularioTipoDocumento({
  encargoId,
  categorias,
  tipo,
}: {
  encargoId: string;
  categorias: { id: string; nombre: string }[];
  tipo?: { id: string; clave: string; nombre: string; categoria_id: string };
}) {
  return (
    <Formulario
      accion={guardarTipoDocumento}
      textoEnviar={tipo ? "Guardar cambios" : "Agregar tipo"}
      ocultos={{ encargo_id: encargoId, ...(tipo ? { id: tipo.id } : {}) }}
    >
      {(estado) => (
        <>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Campo
              nombre="nombre"
              etiqueta="Nombre del tipo"
              estado={estado}
              valor={tipo?.nombre}
              requerido
            />
            <Campo
              nombre="clave"
              etiqueta="Clave"
              estado={estado}
              valor={tipo?.clave}
              ayuda="Minúsculas y guion bajo, p. ej. contrato_marco."
              requerido
            />
          </div>
          <Selector
            nombre="categoria_id"
            etiqueta="Categoría"
            estado={estado}
            valor={tipo?.categoria_id}
            vacio="Elige una categoría"
            opciones={categorias.map((c) => ({ valor: c.id, texto: c.nombre }))}
          />
        </>
      )}
    </Formulario>
  );
}
