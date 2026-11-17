/**
 * Catálogo único de módulos y recorridos de la plataforma. Lo comparten el menú superior, la barra
 * lateral, la barra de navegación y los recorridos guiados: un nombre o una descripción se cambia
 * aquí y cambia en todas partes.
 */
export const CATEGORIAS_MODULO = [
  { clave: "integracion", nombre: "Integración de fuentes" },
  { clave: "analisis", nombre: "Análisis" },
  { clave: "gestion", nombre: "Gestión del encargo" },
] as const;
export type CategoriaModulo = (typeof CATEGORIAS_MODULO)[number]["clave"];

export type Modulo = {
  clave: string;
  nombre: string;
  /** Descripción corta para el menú y los recorridos. */
  descripcion: string;
  /** Ruta relativa al encargo (`/encargos/[encargo]` + ruta). */
  ruta: string;
  categoria: CategoriaModulo;
  /** false = aún no construido: se muestra deshabilitado. */
  listo: boolean;
  /** false = no aparece en la barra lateral (se llega desde otro módulo o desde el menú). */
  lateral?: boolean;
};

export const MODULOS = [
  {
    clave: "resumen",
    nombre: "Resumen",
    descripcion: "Datos generales del encargo y accesos a los recorridos guiados.",
    ruta: "",
    categoria: "gestion",
    listo: true,
  },
  {
    clave: "expedientes",
    nombre: "Expedientes",
    descripcion: "Integra y organiza la información por asunto, contrato o línea de revisión.",
    ruta: "/expedientes",
    categoria: "gestion",
    listo: true,
  },
  {
    clave: "registros",
    nombre: "Registros",
    descripcion: "Todos los registros del encargo: cuatro vistas, árbol, búsqueda y exportación.",
    ruta: "/registros",
    categoria: "gestion",
    listo: true,
  },
  {
    clave: "importaciones",
    nombre: "Importación de Excel",
    descripcion: "Convierte hojas de cálculo en registros trazables hasta la celda de origen.",
    ruta: "/importaciones",
    categoria: "integracion",
    listo: true,
  },
  {
    clave: "red",
    nombre: "Red de vínculos",
    descripcion: "Genera y califica la red de entidades, vínculos declarados y eventos.",
    ruta: "/red",
    categoria: "analisis",
    listo: true,
  },
  {
    clave: "vista",
    nombre: "Vista de la red",
    descripcion: "Explora gráficamente las relaciones y consulta la evidencia de cada una.",
    ruta: "/red/vista",
    categoria: "analisis",
    listo: true,
    lateral: false,
  },
  {
    clave: "alertas",
    nombre: "Alertas",
    descripcion: "Inconsistencias entre fuentes, con las evidencias lado a lado para resolverlas.",
    ruta: "/alertas",
    categoria: "analisis",
    listo: true,
  },
  {
    clave: "ingreso",
    nombre: "Ingreso de documentos",
    descripcion: "Sube los archivos originales; quedan sellados y listos para su lectura.",
    ruta: "/ingreso/importar",
    categoria: "integracion",
    listo: true,
  },
  {
    clave: "captura",
    nombre: "Captura manual",
    descripcion: "Registra información que no viene en un archivo, con su fuente declarada.",
    ruta: "/ingreso/capturar",
    categoria: "integracion",
    listo: true,
  },
  {
    clave: "validacion",
    nombre: "Validación",
    descripcion: "Revisa lo que leyó la IA: acepta, corrige o rechaza antes de que cuente.",
    ruta: "/validacion",
    categoria: "integracion",
    listo: true,
  },
  {
    clave: "analizador",
    nombre: "Analizador",
    descripcion: "Síntesis de un expediente o entidad, con cada afirmación ligada a su origen.",
    ruta: "/analizador",
    categoria: "analisis",
    listo: false,
    lateral: false,
  },
  {
    clave: "recorridos",
    nombre: "Recorridos guiados",
    descripcion: "Empieza por una tarea y sigue sus etapas paso a paso.",
    ruta: "/recorridos",
    categoria: "gestion",
    listo: true,
    lateral: false,
  },
  {
    clave: "configuracion",
    nombre: "Configuración",
    descripcion: "Catálogo documental, IA permitida y reglas de calificación del encargo.",
    ruta: "/configuracion",
    categoria: "gestion",
    listo: true,
  },
] as const satisfies readonly Modulo[];
export type ClaveModulo = (typeof MODULOS)[number]["clave"];

export function moduloPorClave(clave: ClaveModulo): Modulo {
  const m = MODULOS.find((x) => x.clave === clave);
  if (!m) throw new Error(`módulo desconocido: ${clave}`);
  return m;
}

/** Señales de avance que la plataforma sabe medir en un encargo. */
export const SENALES_AVANCE = [
  "expedientes",
  "importaciones",
  "documentos",
  "extracciones",
  "validados",
  "llamadas",
  "entidades",
  "red",
  "alertas",
  "alertas_resueltas",
] as const;
export type SenalAvance = (typeof SENALES_AVANCE)[number];

export type EtapaRecorrido = {
  titulo: string;
  /** Qué se hace en la etapa. */
  descripcion: string;
  modulo: ClaveModulo;
  /** Texto del botón que lleva al módulo. */
  accion: string;
  /** Ayuda: con qué se puede empezar, qué es opcional. */
  ayuda?: string;
  /** Con qué dato del encargo se considera hecha; sin señal, la etapa es de consulta. */
  senal?: SenalAvance;
};

export type Recorrido = {
  clave: string;
  nombre: string;
  objetivo: string;
  resultado: string;
  etapas: EtapaRecorrido[];
};

export const RECORRIDOS: readonly Recorrido[] = [
  {
    clave: "integrar-expediente",
    nombre: "Integrar un expediente",
    objetivo: "Reúne información de distintas fuentes en un expediente organizado.",
    resultado: "Un expediente con sus documentos, registros validados y red.",
    etapas: [
      {
        titulo: "Crear el expediente",
        descripcion: "Define el expediente donde se reunirá la información.",
        modulo: "expedientes",
        accion: "Ir a Expedientes",
        ayuda: "Basta el identificador; el número de control puede agregarse después.",
        senal: "expedientes",
      },
      {
        titulo: "Agregar información",
        descripcion: "Sube los documentos originales o importa el Excel de la entidad auditada.",
        modulo: "ingreso",
        accion: "Ingresar documentos",
        ayuda: "También puedes importar un Excel o capturar a mano lo que no venga en archivo.",
        senal: "documentos",
      },
      {
        titulo: "Validar",
        descripcion: "Revisa lo que leyó la IA antes de que alimente entidades y vínculos.",
        modulo: "validacion",
        accion: "Ir a Validación",
        senal: "validados",
      },
      {
        titulo: "Generar la red",
        descripcion: "Reúne las entidades del expediente con sus vínculos y califícalas.",
        modulo: "red",
        accion: "Ir a la Red de vínculos",
        senal: "red",
      },
    ],
  },
  {
    clave: "analizar-documentos",
    nombre: "Analizar documentos existentes",
    objetivo: "Incorpora documentos que ya tienes, léelos y revisa lo que dicen.",
    resultado: "Registros validados y las inconsistencias detectadas entre ellos.",
    etapas: [
      {
        titulo: "Cargar archivos",
        descripcion: "Sube los archivos; cada original queda sellado con su huella.",
        modulo: "ingreso",
        accion: "Ingresar documentos",
        ayuda: "PDF, imágenes, Word y Excel. Puedes subir varios a la vez.",
        senal: "documentos",
      },
      {
        titulo: "Lectura con IA",
        descripcion: "La IA propone los datos de cada documento, con su página y su confianza.",
        modulo: "ingreso",
        accion: "Ver el estado de la lectura",
        ayuda: "La IA solo lee si un administrador la permitió en este encargo (Configuración).",
        senal: "extracciones",
      },
      {
        titulo: "Validar",
        descripcion: "Acepta, corrige o rechaza lo que propuso la IA.",
        modulo: "validacion",
        accion: "Ir a Validación",
        senal: "validados",
      },
      {
        titulo: "Revisar alertas",
        descripcion: "Consulta las inconsistencias entre fuentes y resuélvelas con su evidencia.",
        modulo: "alertas",
        accion: "Ir a Alertas",
        senal: "alertas",
      },
    ],
  },
  {
    clave: "analizar-comunicaciones",
    nombre: "Analizar comunicaciones",
    objetivo: "Parte de registros telefónicos para identificar contactos, relaciones y patrones.",
    resultado: "La red de comunicaciones con el registro que sustenta cada relación.",
    etapas: [
      {
        titulo: "Importar los registros",
        descripcion: "Importa el Excel con la hoja de llamadas.",
        modulo: "importaciones",
        accion: "Ir a Importación de Excel",
        ayuda:
          "La plantilla de importación indica qué columna es origen, destino, fecha y duración.",
        senal: "llamadas",
      },
      {
        titulo: "Generar la red",
        descripcion: "Las llamadas se agrupan por par de teléfonos y de personas.",
        modulo: "red",
        accion: "Ir a la Red de vínculos",
        senal: "red",
      },
      {
        titulo: "Explorar relaciones",
        descripcion: "Centra un teléfono o una persona y consulta el registro de cada relación.",
        modulo: "vista",
        accion: "Explorar la red",
      },
      {
        titulo: "Revisar alertas",
        descripcion: "Revisa lo que no cuadra entre las llamadas y el resto de las fuentes.",
        modulo: "alertas",
        accion: "Ir a Alertas",
        senal: "alertas",
      },
    ],
  },
  {
    clave: "investigar-entidad",
    nombre: "Investigar una entidad",
    objetivo: "Reúne todo lo que el encargo sabe de una persona, empresa, cuenta o teléfono.",
    resultado: "La ficha de la entidad con sus registros, relaciones y alertas.",
    etapas: [
      {
        titulo: "Tener información",
        descripcion: "La entidad debe aparecer en algún registro del encargo.",
        modulo: "importaciones",
        accion: "Ir a Importación de Excel",
        ayuda: "Si aún no hay nada, importa un Excel, ingresa documentos o captura a mano.",
        senal: "entidades",
      },
      {
        titulo: "Generar la red",
        descripcion: "Elige la entidad como punto de partida y hasta dónde llega la red.",
        modulo: "red",
        accion: "Ir a la Red de vínculos",
        senal: "red",
      },
      {
        titulo: "Buscar y centrar",
        descripcion: "Busca la entidad por nombre, céntrala y revisa su ficha y sus relaciones.",
        modulo: "vista",
        accion: "Explorar la red",
      },
      {
        titulo: "Revisar sus alertas",
        descripcion: "Consulta las inconsistencias en las que participa.",
        modulo: "alertas",
        accion: "Ir a Alertas",
        senal: "alertas",
      },
    ],
  },
  {
    clave: "cerrar-analisis",
    nombre: "Cerrar el análisis",
    objetivo: "Resuelve lo pendiente y deja el encargo listo para su informe.",
    resultado: "Alertas resueltas con motivo y la red final calificada.",
    etapas: [
      {
        titulo: "Terminar la validación",
        descripcion: "No dejes extracciones pendientes: lo no validado no cuenta.",
        modulo: "validacion",
        accion: "Ir a Validación",
        senal: "validados",
      },
      {
        titulo: "Resolver alertas",
        descripcion: "Confirma o descarta cada alerta, con su motivo.",
        modulo: "alertas",
        accion: "Ir a Alertas",
        senal: "alertas_resueltas",
      },
      {
        titulo: "Regenerar la red",
        descripcion: "Vuelve a generar la red para que refleje lo validado y lo resuelto.",
        modulo: "red",
        accion: "Ir a la Red de vínculos",
        senal: "red",
      },
      {
        titulo: "Síntesis",
        descripcion: "Genera la síntesis del expediente, con cada afirmación ligada a su origen.",
        modulo: "analizador",
        accion: "Ir al Analizador",
      },
    ],
  },
];

export function recorridoPorClave(clave: string): Recorrido | undefined {
  return RECORRIDOS.find((r) => r.clave === clave);
}
