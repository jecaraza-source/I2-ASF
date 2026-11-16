/**
 * Motor de importación: aplica una plantilla a un libro ya leído y produce
 * registros con sus extracciones (ubicación hoja/fila/celda), entidades,
 * vínculos, eventos y cifras declaradas. Función pura: no toca la base.
 */
import {
  agregarIdentificador,
  fechaHoraLocal,
  montosEnTexto,
  normalizarEncabezado,
  normalizarFecha,
  normalizarFuerza,
  normalizarHora,
  normalizarMonto,
  normalizarNombre,
  primerNumero,
  referenciaA1,
  rfcValido,
  sinAcentos,
  textoDe,
  type Celda,
  type Identificadores,
} from "./normalizacion";
import type { ClaseHoja, HojaMapeo, HojaTabla, Plantilla } from "./plantilla";

// ---------------------------------------------------------------------------
// Tipos de entrada y salida
// ---------------------------------------------------------------------------

export type Hoja = { nombre: string; filas: Celda[][] };
export type Libro = { hojas: Hoja[] };

export type Ubicacion = { hoja: string; fila: number; celda: string };

export type ExtraccionImportada = {
  campo: string;
  valor_crudo: string;
  valor_normalizado: unknown;
  ubicacion: Ubicacion;
};

export type RegistroImportado = {
  clave: string;
  clase: ClaseHoja;
  hoja: string;
  fila: number | null;
  resumen: string;
  fecha_documento: string | null;
  extracciones: ExtraccionImportada[];
};

export type TipoEntidad =
  "persona_fisica" | "persona_moral" | "cuenta" | "domicilio" | "telefono" | "dependencia" | "otro";

export type EntidadImportada = {
  clave: string;
  tipo: TipoEntidad;
  nombre: string;
  nombre_normalizado: string;
  identificadores: Identificadores;
  atributos: { tipos_declarados?: string[]; id_archivo?: string };
  riesgo_declarado: string | null;
  apariciones: { registro: string; rol: string }[];
};

export type VinculoImportado = {
  origen: string;
  destino: string;
  tipo: string;
  fuerza: number | null;
  fuerza_original: string | null;
  fecha_inicio: string | null;
  dirigido: boolean;
  registro: string;
};

export type EventoImportado = {
  tipo: "contrato" | "transferencia" | "llamada";
  fecha_hora: string | null;
  monto: string | null;
  moneda: string | null;
  atributos: Record<string, string | number | null>;
  participantes: { entidad: string; rol: "origen" | "destino" | "parte" }[];
  registro: string;
};

export type CifraDeclarada = {
  registro: string;
  concepto: string;
  valor: string;
  es_monto: boolean;
  valor_crudo: string;
  ubicacion: Ubicacion;
};

export type FilaExcluida = {
  fila: number;
  motivo: "fila de totales" | "nota" | "sin identificador válido";
};

export type ResumenHoja = {
  hoja: string;
  estado: "procesada" | "cifras" | "no_mapeada" | "error";
  clase?: ClaseHoja;
  filas_validas: number;
  excluidas: FilaExcluida[];
  cifras: number;
  error?: string;
};

export type ResultadoImportacion = {
  plantilla: string;
  hojas: ResumenHoja[];
  registros: RegistroImportado[];
  entidades: EntidadImportada[];
  vinculos: VinculoImportado[];
  eventos: EventoImportado[];
  cifras: CifraDeclarada[];
};

// ---------------------------------------------------------------------------
// Detección de plantilla (§8: por firma_hojas)
// ---------------------------------------------------------------------------

const FILAS_PARA_FIRMA = 10;

function buscarHoja(libro: Libro, nombre: string): Hoja | undefined {
  const objetivo = normalizarEncabezado(nombre);
  return libro.hojas.find((h) => normalizarEncabezado(h.nombre) === objetivo);
}

export function cumpleFirma(libro: Libro, plantilla: Plantilla): boolean {
  return plantilla.firma_hojas.every((firma) => {
    const hoja = buscarHoja(libro, firma.hoja);
    if (!hoja) return false;
    const vistos = new Set(
      hoja.filas
        .slice(0, FILAS_PARA_FIRMA)
        .flat()
        .map((c) => normalizarEncabezado(textoDe(c)))
        .filter(Boolean),
    );
    return firma.encabezados.every((e) => vistos.has(normalizarEncabezado(e)));
  });
}

/** Primera plantilla cuya firma se cumple; gana la de firma más específica. */
export function detectarPlantilla<P extends Plantilla>(
  libro: Libro,
  plantillas: readonly P[],
): P | null {
  const candidatas = plantillas.filter((p) => cumpleFirma(libro, p));
  candidatas.sort((a, b) => peso(b) - peso(a));
  return candidatas[0] ?? null;
}

const peso = (p: Plantilla) => p.firma_hojas.reduce((n, f) => n + 1 + f.encabezados.length, 0);

// ---------------------------------------------------------------------------
// Resolución de entidades dentro del archivo (§8)
// Prioridad: RFC → ID del archivo → teléfono → nombre normalizado.
// ---------------------------------------------------------------------------

type DatosEntidad = {
  nombre?: string;
  tipoTexto?: string;
  tipo?: TipoEntidad;
  idFiscal?: string;
  rfc?: string;
  idArchivo?: string;
  telefono?: string;
  riesgo?: string;
};

export function tipoDesdeTexto(texto: string | undefined): TipoEntidad {
  if (!texto) return "otro";
  const t = sinAcentos(texto).toUpperCase();
  if (/PERSONA|FUNCIONARIO|TESTAFERRO|PRESTANOMBRE/.test(t)) return "persona_fisica";
  if (/DEPENDENCIA|ENTIDAD FEDERAL|GOBIERNO|SECRETARIA/.test(t)) return "dependencia";
  if (/EMPRESA|OFFSHORE|FIDEICOMISO|INSTITUCION|BANCO|NOTARIA|SOCIEDAD/.test(t))
    return "persona_moral";
  if (/TELEFONO/.test(t)) return "telefono";
  if (/CUENTA/.test(t)) return "cuenta";
  if (/DOMICILIO/.test(t)) return "domicilio";
  return "otro";
}

class Resolutor {
  readonly entidades = new Map<string, EntidadImportada>();
  private readonly indice = new Map<string, string>();
  private consecutivo = 0;

  private requerir(clave: string): EntidadImportada {
    const e = this.entidades.get(clave);
    if (!e) throw new Error(`Entidad ${clave} no registrada`);
    return e;
  }

  obtener(d: DatosEntidad, registro: string, rol: string): string | null {
    let ids: Identificadores = {};
    if (d.rfc) ids = agregarIdentificador(ids, "rfc", d.rfc);
    if (d.idFiscal) ids = agregarIdentificador(ids, "id_fiscal", d.idFiscal);
    if (d.telefono) ids = { ...ids, telefono: d.telefono.replace(/\D/g, "") };
    const rfc = rfcValido(ids);
    const nombre = (d.nombre ?? "").trim() || d.telefono?.trim() || d.idArchivo?.trim() || "";
    if (!nombre) return null;
    const normalizado = normalizarNombre(nombre);
    const llaves = [
      rfc ? `rfc:${rfc}` : null,
      d.idArchivo ? `id:${d.idArchivo.trim().toUpperCase()}` : null,
      ids.telefono ? `tel:${ids.telefono}` : null,
    ].filter((l): l is string => l !== null);
    const llaveNombre = d.tipo === "telefono" ? null : `nombre:${normalizado}`;

    let clave = llaves.map((l) => this.indice.get(l)).find(Boolean);
    if (!clave && llaveNombre) {
      const porNombre = this.indice.get(llaveNombre);
      const existente = porNombre ? this.entidades.get(porNombre) : undefined;
      // Mismo nombre pero RFC distinto: son entidades diferentes.
      const otroRfc =
        existente &&
        rfc &&
        rfcValido(existente.identificadores) &&
        rfcValido(existente.identificadores) !== rfc;
      if (porNombre && !otroRfc) clave = porNombre;
    }

    const tipo = d.tipo ?? tipoDesdeTexto(d.tipoTexto);
    const tipoDeclarado = d.tipoTexto?.trim();
    const riesgo = d.riesgo?.trim() ? sinAcentos(d.riesgo).toUpperCase().trim() : null;

    if (!clave) {
      clave = `e${++this.consecutivo}`;
      this.entidades.set(clave, {
        clave,
        tipo,
        nombre: nombre.replace(/\s+/g, " "),
        nombre_normalizado: normalizado || nombre.toUpperCase(),
        identificadores: ids,
        atributos: {
          ...(tipoDeclarado ? { tipos_declarados: [tipoDeclarado] } : {}),
          ...(d.idArchivo ? { id_archivo: d.idArchivo.trim().toUpperCase() } : {}),
        },
        riesgo_declarado: riesgo,
        apariciones: [],
      });
    } else {
      const e = this.requerir(clave);
      if (e.tipo === "otro" && tipo !== "otro") e.tipo = tipo;
      e.identificadores = combinarIdentificadores(e.identificadores, ids);
      if (tipoDeclarado) {
        e.atributos.tipos_declarados = [
          ...new Set([...(e.atributos.tipos_declarados ?? []), tipoDeclarado]),
        ];
      }
      if (d.idArchivo && !e.atributos.id_archivo)
        e.atributos.id_archivo = d.idArchivo.trim().toUpperCase();
      if (riesgo && !e.riesgo_declarado) e.riesgo_declarado = riesgo;
      // Si solo se conocía por ID o teléfono, el primer nombre real lo sustituye.
      if (
        d.nombre?.trim() &&
        (e.nombre === e.atributos.id_archivo || e.nombre === e.identificadores.telefono)
      ) {
        e.nombre = d.nombre.trim().replace(/\s+/g, " ");
        e.nombre_normalizado = normalizado;
      }
    }

    for (const l of llaves) this.indice.set(l, clave);
    const actual = this.requerir(clave);
    if (actual.tipo !== "telefono") this.indice.set(`nombre:${actual.nombre_normalizado}`, clave);
    if (!actual.apariciones.some((a) => a.registro === registro && a.rol === rol)) {
      actual.apariciones.push({ registro, rol });
    }
    return clave;
  }
}

function combinarIdentificadores(a: Identificadores, b: Identificadores): Identificadores {
  const r: Identificadores = { ...b, ...a };
  const invalidos = [...new Set([...(a.invalidos ?? []), ...(b.invalidos ?? [])])].filter((c) =>
    c === "rfc" ? !rfcValido(r) || a.invalidos?.includes("rfc") : true,
  );
  if (invalidos.length) r.invalidos = invalidos;
  else delete r.invalidos;
  return r;
}

// ---------------------------------------------------------------------------
// Lectura de tablas
// ---------------------------------------------------------------------------

type Rol = "monto" | "fecha" | "hora" | "fuerza" | "entero" | "texto";

const ROLES_COLUMNA: Record<string, Rol> = {
  monto_original: "monto",
  monto_pagado: "monto",
  fecha: "fecha",
  hora: "hora",
  fuerza: "fuerza",
  duracion: "entero",
};

function valorNormalizado(c: Celda, rol: Rol | undefined): unknown {
  switch (rol) {
    case "monto":
      return normalizarMonto(c);
    case "fecha":
      return normalizarFecha(c);
    case "hora":
      return normalizarHora(c);
    case "fuerza":
      return normalizarFuerza(c);
    case "entero": {
      const n = typeof c === "number" ? c : Number(textoDe(c));
      return Number.isFinite(n) ? n : null;
    }
    default:
      return c instanceof Date ? normalizarFecha(c) : typeof c === "number" ? c : textoDe(c);
  }
}

function primeraCeldaConTexto(fila: Celda[]): string {
  for (const c of fila) {
    const t = textoDe(c);
    if (t) return t;
  }
  return "";
}

const esVacia = (fila: Celda[]) => fila.every((c) => textoDe(c) === "");

type Columnas = Record<string, number>;

/** Índices (base 0) de las columnas mapeadas, buscadas por encabezado. */
function indicesDeColumnas(
  encabezados: Celda[],
  mapeo: Record<string, string | undefined>,
): { indices: Columnas; faltantes: string[] } {
  const normalizados = encabezados.map((c) => normalizarEncabezado(textoDe(c)));
  const indices: Columnas = {};
  const faltantes: string[] = [];
  for (const [rol, nombre] of Object.entries(mapeo)) {
    if (!nombre) continue;
    const i = normalizados.indexOf(normalizarEncabezado(nombre));
    if (i === -1) faltantes.push(nombre);
    else indices[rol] = i;
  }
  return { indices, faltantes };
}

function columnasDe(h: HojaTabla): Record<string, string | undefined> {
  const base: Record<string, string | undefined> = { ...h.columnas };
  if (h.clase === "transferencias") {
    h.montos.forEach((m, i) => {
      base[`monto_${i}`] = m.columna;
    });
  }
  return base;
}

// ---------------------------------------------------------------------------
// Importación
// ---------------------------------------------------------------------------

export function importar(
  libro: Libro,
  plantilla: Plantilla,
  opciones: { zonaHoraria?: string } = {},
): ResultadoImportacion {
  const zona = opciones.zonaHoraria ?? "America/Mexico_City";
  const resolutor = new Resolutor();
  const registros: RegistroImportado[] = [];
  const vinculos: VinculoImportado[] = [];
  const eventos: EventoImportado[] = [];
  const cifras: CifraDeclarada[] = [];
  const resumen = new Map<string, ResumenHoja>();

  // Las hojas de entidades van primero para que los IDs del archivo se resuelvan.
  const orden = [...plantilla.mapeo.hojas].sort(
    (a, b) => Number(b.clase === "entidades") - Number(a.clase === "entidades"),
  );

  for (const mapeo of orden) {
    const hoja = buscarHoja(libro, mapeo.hoja);
    if (!hoja) {
      resumen.set(mapeo.hoja, {
        hoja: mapeo.hoja,
        estado: "error",
        clase: mapeo.clase,
        filas_validas: 0,
        excluidas: [],
        cifras: 0,
        error: "La hoja no existe en el archivo",
      });
      continue;
    }
    if (mapeo.clase === "cifras") {
      const encontradas = leerCifras(hoja, registros);
      cifras.push(...encontradas);
      resumen.set(hoja.nombre, {
        hoja: hoja.nombre,
        estado: "cifras",
        clase: "cifras",
        filas_validas: 0,
        excluidas: [],
        cifras: encontradas.length,
      });
      continue;
    }
    resumen.set(
      hoja.nombre,
      leerTabla(hoja, mapeo, { resolutor, registros, vinculos, eventos, cifras, zona }),
    );
  }

  // Ninguna hoja se ignora en silencio (§8).
  const hojas: ResumenHoja[] = libro.hojas.map(
    (h) =>
      resumen.get(h.nombre) ?? {
        hoja: h.nombre,
        estado: "no_mapeada",
        filas_validas: 0,
        excluidas: [],
        cifras: 0,
      },
  );
  for (const r of resumen.values()) if (r.estado === "error" && !hojas.includes(r)) hojas.push(r);

  return {
    plantilla: plantilla.nombre,
    hojas,
    registros,
    entidades: [...resolutor.entidades.values()],
    vinculos,
    eventos,
    cifras,
  };
}

type Contexto = {
  resolutor: Resolutor;
  registros: RegistroImportado[];
  vinculos: VinculoImportado[];
  eventos: EventoImportado[];
  cifras: CifraDeclarada[];
  zona: string;
};

function leerTabla(hoja: Hoja, mapeo: HojaTabla, ctx: Contexto): ResumenHoja {
  const resumen: ResumenHoja = {
    hoja: hoja.nombre,
    estado: "procesada",
    clase: mapeo.clase,
    filas_validas: 0,
    excluidas: [],
    cifras: 0,
  };
  const encabezados = hoja.filas[mapeo.fila_encabezado - 1] ?? [];
  const { indices, faltantes } = indicesDeColumnas(encabezados, columnasDe(mapeo));
  if (faltantes.length) {
    return { ...resumen, estado: "error", error: `Faltan columnas: ${faltantes.join(", ")}` };
  }
  const rolPorIndice = new Map<number, Rol>();
  for (const [rol, i] of Object.entries(indices)) {
    const r = ROLES_COLUMNA[rol] ?? (rol.startsWith("monto_") ? "monto" : undefined);
    if (r) rolPorIndice.set(i, r);
  }
  const titulos = encabezados.map(
    (c, i) => textoDe(c) || `COLUMNA ${referenciaA1(1, i + 1).replace(/\d+$/, "")}`,
  );
  const claveTotales = `${hoja.nombre}!totales`;

  for (let i = mapeo.fila_encabezado; i < hoja.filas.length; i++) {
    const fila = hoja.filas[i] ?? [];
    const numero = i + 1;
    if (esVacia(fila)) continue;

    const primera = sinAcentos(primeraCeldaConTexto(fila)).toUpperCase();
    if (/^(TOTAL|RESUMEN)/.test(primera)) {
      resumen.excluidas.push({ fila: numero, motivo: "fila de totales" });
      // Los totales del archivo sí se guardan como cifra declarada (para R01).
      fila.forEach((c, j) => {
        const valor = normalizarMonto(c);
        if (valor === null) return;
        const cifra: CifraDeclarada = {
          registro: claveTotales,
          concepto: `${hoja.nombre} · ${titulos[j] ?? ""}`.trim(),
          valor,
          es_monto: rolPorIndice.get(j) === "monto",
          valor_crudo: textoDe(c),
          ubicacion: { hoja: hoja.nombre, fila: numero, celda: referenciaA1(numero, j + 1) },
        };
        ctx.cifras.push(cifra);
        resumen.cifras++;
      });
      continue;
    }
    if (primera.startsWith("[")) {
      resumen.excluidas.push({ fila: numero, motivo: "nota" });
      continue;
    }

    const celda = (rol: string): Celda => {
      const j = indices[rol];
      return j === undefined ? null : (fila[j] ?? null);
    };
    const texto = (rol: string) => textoDe(celda(rol));

    if (!filaValida(mapeo, texto)) {
      resumen.excluidas.push({ fila: numero, motivo: "sin identificador válido" });
      continue;
    }

    const clave = `${hoja.nombre}!${numero}`;
    const extracciones: ExtraccionImportada[] = [];
    fila.forEach((c, j) => {
      const crudo = c instanceof Date ? (normalizarFecha(c) ?? "") : textoDe(c);
      if (!crudo) return;
      extracciones.push({
        campo: titulos[j] ?? `COLUMNA ${j + 1}`,
        valor_crudo: crudo,
        valor_normalizado: valorNormalizado(c, rolPorIndice.get(j)),
        ubicacion: { hoja: hoja.nombre, fila: numero, celda: referenciaA1(numero, j + 1) },
      });
    });

    const fecha = normalizarFecha(celda("fecha"));
    const registro: RegistroImportado = {
      clave,
      clase: mapeo.clase,
      hoja: hoja.nombre,
      fila: numero,
      resumen: resumenFila(mapeo, texto),
      fecha_documento: fecha,
      extracciones,
    };
    ctx.registros.push(registro);
    resumen.filas_validas++;
    producir(mapeo, { celda, texto, clave, fecha, ctx });
  }

  if (resumen.cifras > 0) {
    ctx.registros.push(registroDeCifras(claveTotales, hoja.nombre, ctx.cifras));
  }
  return resumen;
}

function filaValida(m: HojaTabla, texto: (rol: string) => string): boolean {
  switch (m.clase) {
    case "contratos":
      return Boolean(texto("identificador") && texto("proveedor"));
    case "vinculos":
      return Boolean(texto("origen") && texto("destino"));
    case "transferencias":
      return Boolean(
        (texto("origen") || texto("origen_id")) && (texto("destino") || texto("destino_id")),
      );
    case "llamadas":
      return Boolean(texto("numero_origen") && texto("numero_destino"));
    case "entidades":
      return Boolean(texto("nombre") || texto("id"));
  }
}

function resumenFila(m: HojaTabla, texto: (rol: string) => string): string {
  switch (m.clase) {
    case "contratos":
      return `Contrato ${texto("numero") || texto("identificador")}`;
    case "vinculos":
      return `Vínculo ${texto("tipo_vinculo") || "declarado"}`;
    case "transferencias":
      return `Transferencia ${texto("identificador")}`.trim();
    case "llamadas":
      return `Llamada ${texto("tipo")}`.trim();
    case "entidades":
      return `Entidad ${texto("id")}`.trim();
  }
}

function producir(
  m: HojaTabla,
  p: {
    celda: (rol: string) => Celda;
    texto: (rol: string) => string;
    clave: string;
    fecha: string | null;
    ctx: Contexto;
  },
): void {
  const { texto, clave, fecha, ctx } = p;
  const r = ctx.resolutor;
  const fechaHora = (hora: string | null = null) =>
    fecha ? fechaHoraLocal(fecha, hora, ctx.zona) : null;

  switch (m.clase) {
    case "entidades": {
      r.obtener(
        {
          nombre: texto("nombre"),
          tipoTexto: texto("tipo"),
          idArchivo: texto("id") || undefined,
          idFiscal: texto("id_fiscal") || undefined,
          riesgo: texto("riesgo") || undefined,
        },
        clave,
        "entidad",
      );
      return;
    }
    case "contratos": {
      const proveedor = r.obtener(
        { nombre: texto("proveedor"), tipo: "persona_moral", rfc: texto("rfc") || undefined },
        clave,
        "proveedor",
      );
      const dependencia = texto("dependencia")
        ? r.obtener({ nombre: texto("dependencia"), tipo: "dependencia" }, clave, "dependencia")
        : null;
      const participantes: EventoImportado["participantes"] = [];
      if (dependencia) participantes.push({ entidad: dependencia, rol: "origen" });
      if (proveedor) participantes.push({ entidad: proveedor, rol: "destino" });
      ctx.eventos.push({
        tipo: "contrato",
        fecha_hora: fechaHora(),
        monto: normalizarMonto(p.celda("monto_original")),
        moneda: m.moneda,
        atributos: {
          identificador: texto("identificador"),
          numero: texto("numero") || null,
          monto_pagado: normalizarMonto(p.celda("monto_pagado")),
        },
        participantes,
        registro: clave,
      });
      return;
    }
    case "vinculos": {
      const extremo = (rol: "origen" | "destino") =>
        m.extremos_por_id
          ? r.obtener(
              { idArchivo: texto(rol), tipoTexto: texto(`tipo_${rol}`) || undefined },
              clave,
              rol,
            )
          : r.obtener(
              { nombre: texto(rol), tipoTexto: texto(`tipo_${rol}`) || undefined },
              clave,
              rol,
            );
      const origen = extremo("origen");
      const destino = extremo("destino");
      if (!origen || !destino) return;
      ctx.vinculos.push({
        origen,
        destino,
        tipo: texto("tipo_vinculo") || "VINCULO",
        fuerza: normalizarFuerza(p.celda("fuerza")),
        fuerza_original: texto("fuerza") || null,
        fecha_inicio: fecha,
        dirigido: false,
        registro: clave,
      });
      return;
    }
    case "transferencias": {
      const extremo = (rol: "origen" | "destino") =>
        r.obtener(
          { nombre: texto(rol) || undefined, idArchivo: texto(`${rol}_id`) || undefined },
          clave,
          rol,
        );
      const origen = extremo("origen");
      const destino = extremo("destino");
      let monto: string | null = null;
      let moneda: string | null = null;
      m.montos.forEach((mm, i) => {
        if (monto !== null) return;
        const v = normalizarMonto(p.celda(`monto_${i}`));
        if (v !== null) {
          monto = v;
          moneda = mm.moneda;
        }
      });
      const participantes: EventoImportado["participantes"] = [];
      if (origen) participantes.push({ entidad: origen, rol: "origen" });
      if (destino) participantes.push({ entidad: destino, rol: "destino" });
      ctx.eventos.push({
        tipo: "transferencia",
        fecha_hora: fechaHora(),
        monto,
        moneda,
        atributos: {
          folio: texto("identificador") || null,
          tipo_operacion: texto("tipo") || null,
          etapa: texto("etapa") || null,
          cuenta_origen: texto("cuenta_origen") || null,
          cuenta_destino: texto("cuenta_destino") || null,
        },
        participantes,
        registro: clave,
      });
      return;
    }
    case "llamadas": {
      const tel = (rol: "origen" | "destino") =>
        r.obtener({ telefono: texto(`numero_${rol}`), tipo: "telefono" }, clave, rol);
      const persona = (rol: "origen" | "destino") =>
        texto(`nombre_${rol}`)
          ? r.obtener({ nombre: texto(`nombre_${rol}`), tipo: "persona_fisica" }, clave, rol)
          : null;
      const participantes: EventoImportado["participantes"] = [];
      for (const rol of ["origen", "destino"] as const) {
        const t = tel(rol);
        if (t) participantes.push({ entidad: t, rol });
        const pe = persona(rol);
        if (pe) participantes.push({ entidad: pe, rol });
      }
      const duracion = Number(texto("duracion"));
      ctx.eventos.push({
        tipo: "llamada",
        fecha_hora: fechaHora(normalizarHora(p.celda("hora"))),
        monto: null,
        moneda: null,
        atributos: {
          tipo: texto("tipo") || null,
          duracion_seg: Number.isFinite(duracion) && texto("duracion") ? duracion : null,
        },
        participantes,
        registro: clave,
      });
      return;
    }
  }
}

// ---------------------------------------------------------------------------
// Hojas de cifras declaradas (portadas y resúmenes)
// ---------------------------------------------------------------------------

const ETIQUETA_DE_MONTO = /MONTO|MXN|USD|\$|IMPORTE|DIFERENCIA|DANO|RECURSOS|FLUJOS/;
const VALOR_NUMERICO = /^-?\d{1,3}(?:,\d{3})*(?:\.\d+)?(?:\s*\([^)]*\))?(?:\s+[A-Za-zÀ-ÿ]+){0,3}$/;

function leerCifras(hoja: Hoja, registros: RegistroImportado[]): CifraDeclarada[] {
  const clave = `${hoja.nombre}!cifras`;
  const resultado: CifraDeclarada[] = [];
  const consumidas = new Set<string>();

  hoja.filas.forEach((fila, i) => {
    const numero = i + 1;
    fila.forEach((c, j) => {
      const etiqueta = textoDe(c);
      if (!etiqueta || typeof c === "number" || consumidas.has(`${i}:${j}`)) return;
      // Par etiqueta → valor: la siguiente celda con contenido de la fila.
      const k = fila.findIndex((x, n) => n > j && textoDe(x) !== "");
      if (k === -1) return;
      const valorCelda = fila[k] ?? null;
      const valor = valorDeCifra(valorCelda);
      if (valor === null) return;
      consumidas.add(`${i}:${k}`);
      const concepto = etiqueta.replace(/:\s*$/, "");
      resultado.push({
        registro: clave,
        concepto,
        valor: valor.valor,
        es_monto: valor.conSigno || ETIQUETA_DE_MONTO.test(sinAcentos(concepto).toUpperCase()),
        valor_crudo: textoDe(valorCelda),
        ubicacion: { hoja: hoja.nombre, fila: numero, celda: referenciaA1(numero, k + 1) },
      });
    });
  });

  // Montos dentro de texto libre (p. ej. un párrafo de la portada).
  hoja.filas.forEach((fila, i) => {
    const numero = i + 1;
    fila.forEach((c, j) => {
      if (typeof c !== "string" || consumidas.has(`${i}:${j}`)) return;
      if (/^\s*\$/.test(c) && valorDeCifra(c)) return; // ya cuenta como valor de un par
      const montos = montosEnTexto(c);
      if (!montos.length) return;
      const contexto = parrafo(hoja, i, j);
      for (const m of montos) {
        resultado.push({
          registro: clave,
          concepto: contexto,
          valor: m.valor,
          es_monto: true,
          valor_crudo: m.crudo,
          ubicacion: { hoja: hoja.nombre, fila: numero, celda: referenciaA1(numero, j + 1) },
        });
      }
    });
  });

  if (resultado.length) registros.push(registroDeCifras(clave, hoja.nombre, resultado));
  return resultado;
}

function valorDeCifra(c: Celda): { valor: string; conSigno: boolean } | null {
  if (typeof c === "number") return { valor: c.toFixed(2), conSigno: false };
  if (typeof c !== "string") return null;
  const s = c.trim();
  const montos = montosEnTexto(s);
  if (montos.length === 1 && /^\$/.test(s) && montos[0])
    return { valor: montos[0].valor, conSigno: true };
  if (VALOR_NUMERICO.test(s)) {
    const n = primerNumero(s);
    return n === null ? null : { valor: n, conSigno: false };
  }
  return null;
}

/** Texto del párrafo: la celda y hasta tres celdas de texto contiguas arriba. */
function parrafo(hoja: Hoja, fila: number, columna: number): string {
  const partes: string[] = [];
  for (let f = fila; f >= Math.max(0, fila - 3); f--) {
    const t = textoDe(hoja.filas[f]?.[columna] ?? null);
    if (!t || (f !== fila && /:\s*$/.test(t))) break;
    partes.unshift(t);
  }
  return partes.join(" ").replace(/\s+/g, " ").trim();
}

function registroDeCifras(
  clave: string,
  hoja: string,
  cifras: CifraDeclarada[],
): RegistroImportado {
  return {
    clave,
    clase: "cifras",
    hoja,
    fila: null,
    resumen: `Cifras declaradas · ${hoja}`,
    fecha_documento: null,
    extracciones: cifras
      .filter((c) => c.registro === clave)
      .map((c) => ({
        campo: "total_declarado",
        valor_crudo: c.valor_crudo,
        valor_normalizado: { concepto: c.concepto, valor: c.valor, es_monto: c.es_monto },
        ubicacion: c.ubicacion,
      })),
  };
}

export type { HojaMapeo };
