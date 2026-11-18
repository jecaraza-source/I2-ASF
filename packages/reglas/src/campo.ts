/**
 * Verificación en campo (tarea 14): las preguntas de la cédula y qué alerta genera cada «no».
 * La cédula solo confirma la existencia del proveedor en su domicilio.
 */
export type RespuestaCampo = "si" | "no" | "no_verificable";

export type PreguntaCampo = {
  clave: string;
  pregunta: string;
  /** Lo que se afirma cuando la respuesta es «no». */
  hallazgo: string;
  severidad: "critica" | "alta" | "media";
};

export const PREGUNTAS_CAMPO: readonly PreguntaCampo[] = [
  {
    clave: "domicilio_existe",
    pregunta: "¿El domicilio declarado existe y se pudo localizar?",
    hallazgo: "el domicilio declarado no existe o no se localizó",
    severidad: "critica",
  },
  {
    clave: "inmueble_existe",
    pregunta: "¿Hay un inmueble (local, oficina, bodega, taller) en ese domicilio?",
    hallazgo: "no existe un inmueble en el domicilio declarado",
    severidad: "critica",
  },
  {
    clave: "proveedor_presente",
    pregunta:
      "¿El proveedor está establecido ahí (letrero, recepción, razón social visible, vecinos lo confirman)?",
    hallazgo: "el proveedor no está establecido en el domicilio declarado",
    severidad: "critica",
  },
  {
    clave: "actividad_visible",
    pregunta: "¿Hay actividad visible acorde con lo que se le contrató o facturó?",
    hallazgo: "no hay actividad visible acorde con lo contratado o facturado",
    severidad: "alta",
  },
  {
    clave: "persona_confirma",
    pregunta: "¿Alguien en el sitio confirmó que ahí opera el proveedor?",
    hallazgo: "nadie en el sitio confirmó que ahí opere el proveedor",
    severidad: "media",
  },
];

export const NOMBRE_RESPUESTA_CAMPO: Record<RespuestaCampo, string> = {
  si: "Sí coincide",
  no: "No coincide",
  no_verificable: "No se pudo verificar",
};
