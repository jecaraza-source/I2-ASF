"use client";

import type { CampoEsperado } from "@sigma/importador/captura";
import { guardarCamposComunes, guardarCategoria, guardarTipoDocumento } from "@/acciones/catalogo";
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

/**
 * Campos comunes del tipo: cuáles aplican y con qué nombre (p. ej. en un acta constitutiva el monto
 * es «Capital social constitutivo» y no hay número de factura).
 */
export function FormularioCamposComunes({
  tipoId,
  comunes,
  ajustados,
}: {
  tipoId: string;
  /** Campos comunes del catálogo, con su nombre de origen. */
  comunes: readonly CampoEsperado[];
  /** Los mismos ya ajustados al tipo (los ocultos no vienen). */
  ajustados: CampoEsperado[];
}) {
  const porClave = new Map(ajustados.map((c) => [c.clave, c]));
  return (
    <Formulario accion={guardarCamposComunes} textoEnviar="Guardar campos" ocultos={{ id: tipoId }}>
      {() => (
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-1 text-sm text-texto">
            Campos comunes en este tipo de documento
          </legend>
          {comunes.map((c) => {
            const a = porClave.get(c.clave);
            return (
              <div
                key={c.clave}
                className="grid grid-cols-1 items-center gap-2 sm:grid-cols-[10rem_1fr]"
              >
                <label className="flex items-center gap-2 text-sm text-texto">
                  <input type="checkbox" name={`usa_${c.clave}`} defaultChecked={Boolean(a)} />
                  {c.etiqueta}
                </label>
                <input
                  name={`etiqueta_${c.clave}`}
                  aria-label={`Nombre de «${c.etiqueta}» en este tipo`}
                  defaultValue={a?.etiqueta ?? c.etiqueta}
                  maxLength={80}
                  className="w-full rounded-md border border-linea-2 bg-fondo-2 px-3 py-2 text-sm text-texto focus:border-oro focus:outline-none"
                />
              </div>
            );
          })}
          <p className="text-xs text-tenue">
            Desmarca los que no aplican; cambia el nombre si este tipo lo llama distinto. Aplica a
            la captura, a la lectura con IA y a la validación.
          </p>
        </fieldset>
      )}
    </Formulario>
  );
}
