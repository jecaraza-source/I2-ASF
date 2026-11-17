import { PREGUNTAS_CAMPO } from "./campo";
/**
 * Reglas de validación cruzada (§10). Funciones puras `(datos) => Alerta[]`.
 * Generan alertas, nunca hallazgos (regla 4 de CLAUDE.md): el auditor confirma o descarta.
 */
import type {
  Alerta,
  DatosReglas,
  EventoRegla,
  EvidenciaAlerta,
  ExtraccionRegla,
  Regla,
  RegistroRegla,
} from "./tipos";
import {
  centavos,
  cifrasDe,
  entero,
  indice,
  ordenados,
  pesos,
  plano,
  textoDe,
  type Cifra,
} from "./util";

function deCifra(c: Cifra, lado: "a" | "b"): EvidenciaAlerta {
  return {
    lado,
    etiqueta: c.concepto.length > 90 ? `${c.concepto.slice(0, 90)}…` : c.concepto,
    valor: c.es_monto ? pesos(c.valor) : entero(c.valor),
    registro_id: c.registro.id,
    extraccion_id: c.extraccion.id,
    ubicacion: c.extraccion.ubicacion,
  };
}

function deRegistro(
  r: RegistroRegla,
  lado: "a" | "b",
  etiqueta: string,
  valor: string,
  campo?: RegExp,
): EvidenciaAlerta {
  const x = campo ? r.extracciones.find((e) => campo.test(plano(e.campo))) : undefined;
  return {
    lado,
    etiqueta,
    valor,
    registro_id: r.id,
    extraccion_id: x?.id ?? null,
    ubicacion: x?.ubicacion ?? r.extracciones[0]?.ubicacion ?? null,
  };
}

// ---------------------------------------------------------------------------
// R01 · Total declarado distinto de la suma del detalle
// ---------------------------------------------------------------------------
export function r01(datos: DatosReglas): Alerta[] {
  const alertas: Alerta[] = [];
  for (const c of cifrasDe(datos)) {
    const [hoja, columna] = c.concepto.split(" · ");
    if (!hoja || !columna) continue;
    const detalle = datos.registros.filter(
      (r) => r.id !== c.registro.id && plano(r.hoja) === plano(hoja),
    );
    let suma = 0n;
    let filas = 0;
    let numerica = true;
    for (const r of detalle) {
      const x = r.extracciones.find((e) => e.campo === columna);
      if (!x || (x.valor_crudo ?? "").trim() === "") continue;
      const v = centavos(x.valor_normalizado);
      if (v === null) {
        // La columna del detalle no es numérica (p. ej. un total escrito bajo «ESTATUS»).
        numerica = false;
        break;
      }
      suma += v;
      filas++;
    }
    if (!numerica || filas === 0 || suma === c.valor) continue;
    const primera = detalle.find((r) => r.extracciones.some((e) => e.campo === columna));
    if (!primera) continue;
    alertas.push({
      regla: "R01",
      severidad: "alta",
      titulo: `El total de «${columna}» no coincide con la suma del detalle`,
      descripcion: `La fila de totales de ${hoja} declara ${pesos(c.valor)} y las ${filas} filas del detalle suman ${pesos(suma)} (diferencia ${pesos(c.valor - suma)}).`,
      huella: `R01|${c.extraccion.id}`,
      entidades: [],
      evidencias: [
        deCifra(c, "a"),
        deRegistro(
          primera,
          "b",
          `Suma de ${filas} filas de ${hoja}`,
          pesos(suma),
          new RegExp(`^${plano(columna).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`),
        ),
      ],
    });
  }
  return alertas;
}

// ---------------------------------------------------------------------------
// R02 · Mismo concepto con cifras distintas entre hojas o documentos
// ---------------------------------------------------------------------------
const CONCEPTOS_R02 = [
  {
    clave: "monto_contratado",
    nombre: "Monto total contratado",
    patron: /MONTO (TOTAL|ORIGINAL)/,
    excluye: /RIESGO|PAGADO|FLUJO|DIFERENCIA|DANO/,
  },
  {
    clave: "monto_pagado",
    nombre: "Monto total pagado",
    patron: /PAGADO/,
    excluye: /DIFERENCIA|DANO/,
  },
];
/** Cifras del mismo concepto que difieren menos que esto se consideran «la misma cifra». */
const TOLERANCIA_R02 = 10n; // por ciento

export function r02(datos: DatosReglas): Alerta[] {
  const alertas: Alerta[] = [];
  const cifras = cifrasDe(datos).filter((c) => c.es_monto && c.valor > 0n);
  for (const concepto of CONCEPTOS_R02) {
    const grupo = cifras
      .filter((c) => {
        const t = plano(c.concepto);
        return concepto.patron.test(t) && !concepto.excluye.test(t.slice(0, 120));
      })
      .sort((a, b) => (a.valor < b.valor ? -1 : a.valor > b.valor ? 1 : 0));
    let racimo: Cifra[] = [];
    const cerrar = () => {
      const distintos = new Set(racimo.map((c) => c.valor.toString()));
      if (distintos.size >= 2) {
        const valores = [...distintos].map((v) => pesos(BigInt(v)));
        alertas.push({
          regla: "R02",
          severidad: "alta",
          titulo: `${concepto.nombre}: ${distintos.size} cifras distintas`,
          descripcion: `El mismo concepto aparece con cifras distintas: ${valores.join(", ")}.`,
          huella: `R02|${concepto.clave}|${ordenados(racimo.map((c) => c.extraccion.id)).join(",")}`,
          entidades: [],
          evidencias: racimo.map((c, i) => deCifra(c, i === 0 ? "a" : "b")),
        });
      }
      racimo = [];
    };
    for (const c of grupo) {
      const base = racimo[0];
      if (base && (c.valor - base.valor) * 100n > base.valor * TOLERANCIA_R02) cerrar();
      racimo.push(c);
    }
    cerrar();
  }
  return alertas;
}

// ---------------------------------------------------------------------------
// R03 · Afirmación cuantitativa en un vínculo sin respaldo en eventos
// ---------------------------------------------------------------------------
// Solo eventos que por naturaleza ocurren entre dos partes (un contrato no une a un funcionario
// con el proveedor en los datos, así que no se puede contrastar).
const AFIRMACION = /(\d+)\s+(LLAMADAS|TRANSFERENCIAS)\b/;
const TIPO_EVENTO: Record<string, string> = {
  LLAMADAS: "llamada",
  TRANSFERENCIAS: "transferencia",
};

export function r03(datos: DatosReglas): Alerta[] {
  const alertas: Alerta[] = [];
  const registros = indice(datos.registros);
  const entidades = indice(datos.entidades);
  for (const v of datos.vinculos) {
    const registro = v.registro_id ? registros.get(v.registro_id) : undefined;
    if (!registro) continue;
    const x = registro.extracciones.find((e) => AFIRMACION.test(plano(e.valor_crudo)));
    const m = x ? AFIRMACION.exec(plano(x.valor_crudo)) : null;
    if (!x || !m) continue;
    const declarado = Number(m[1]);
    const palabra = m[2] as string;
    const tipo = TIPO_EVENTO[palabra] as string;
    const entre = datos.eventos.filter(
      (e) =>
        e.tipo === tipo &&
        e.participantes.some((p) => p.entidad_id === v.origen_id) &&
        e.participantes.some((p) => p.entidad_id === v.destino_id),
    );
    if (entre.length >= declarado) continue;
    const a = entidades.get(v.origen_id)?.nombre ?? "?";
    const b = entidades.get(v.destino_id)?.nombre ?? "?";
    const respaldo = entre[0]?.registro_id ? registros.get(entre[0].registro_id) : undefined;
    alertas.push({
      regla: "R03",
      severidad: "alta",
      titulo: `Vínculo afirma ${declarado} ${palabra.toLowerCase()} y hay ${entre.length}`,
      descripcion: `El vínculo entre ${a} y ${b} afirma ${declarado} ${palabra.toLowerCase()}; en los eventos registrados entre ambos hay ${entre.length}.`,
      huella: `R03|${v.id}`,
      entidades: [v.origen_id, v.destino_id],
      evidencias: [
        {
          lado: "a",
          etiqueta: `Vínculo ${v.tipo}`,
          valor: x.valor_crudo ?? "",
          registro_id: registro.id,
          extraccion_id: x.id,
          ubicacion: x.ubicacion,
        },
        respaldo
          ? deRegistro(respaldo, "b", `Eventos de tipo ${tipo} entre ambos`, String(entre.length))
          : {
              lado: "b",
              etiqueta: `Eventos de tipo ${tipo} entre ambos`,
              valor: "0 (ningún registro los respalda)",
              registro_id: registro.id,
              extraccion_id: null,
              ubicacion: null,
            },
      ],
    });
  }
  return alertas;
}

// ---------------------------------------------------------------------------
// R04 · Suma de un tipo de evento distinta de la cifra reportada
// ---------------------------------------------------------------------------
const esWire = (e: EventoRegla) =>
  e.tipo === "transferencia" && /WIRE/.test(plano(e.tipo_operacion));
const MEDIDAS_R04: {
  nombre: string;
  patron: RegExp;
  excluye?: RegExp;
  eventos: (e: EventoRegla) => boolean;
}[] = [
  {
    nombre: "transferencias al exterior (wire transfer)",
    patron: /FUGAD|AL EXTERIOR|WIRE/,
    eventos: esWire,
  },
  {
    nombre: "movimientos financieros",
    patron: /FLUJOS FINANCIEROS|MOVIMIENTOS/,
    eventos: (e) => e.tipo === "transferencia",
  },
  { nombre: "llamadas", patron: /LLAMADAS/, eventos: (e) => e.tipo === "llamada" },
  {
    nombre: "contratos",
    patron: /CONTRATOS ANALIZADOS|TOTAL CONTRATOS/,
    eventos: (e) => e.tipo === "contrato",
  },
];

export function r04(datos: DatosReglas): Alerta[] {
  const alertas: Alerta[] = [];
  const registros = indice(datos.registros);
  for (const c of cifrasDe(datos)) {
    // Los totales de fila son de R01; los párrafos narrativos no son una cifra reportada única.
    if (c.concepto.includes(" · ") || c.concepto.length > 80) continue;
    const t = plano(c.concepto);
    const medida = MEDIDAS_R04.find((m) => m.patron.test(t));
    if (!medida) continue;
    const eventos = datos.eventos.filter(medida.eventos);
    if (!eventos.length) continue;
    const real = c.es_monto
      ? eventos.reduce((s, e) => s + (centavos(e.monto) ?? 0n), 0n)
      : BigInt(eventos.length) * 100n;
    if (real === c.valor) continue;
    const fmt = (v: bigint) => (c.es_monto ? pesos(v) : entero(v));
    const primero = eventos
      .map((e) => (e.registro_id ? registros.get(e.registro_id) : undefined))
      .find(Boolean);
    if (!primero) continue;
    alertas.push({
      regla: "R04",
      severidad: "alta",
      titulo: `«${c.concepto}» reporta ${fmt(c.valor)} y el detalle da ${fmt(real)}`,
      descripcion: `La cifra reportada es ${fmt(c.valor)}; ${c.es_monto ? "la suma" : "el conteo"} de ${eventos.length} ${medida.nombre} registrados da ${fmt(real)}.`,
      huella: `R04|${c.extraccion.id}`,
      entidades: [],
      evidencias: [
        deCifra(c, "a"),
        deRegistro(
          primero,
          "b",
          `${c.es_monto ? "Suma" : "Conteo"} de ${eventos.length} ${medida.nombre}`,
          fmt(real),
          /MONTO/,
        ),
      ],
    });
  }
  return alertas;
}

// ---------------------------------------------------------------------------
// R05 · Parentesco declarado con apellidos incompatibles y sin nota
// ---------------------------------------------------------------------------
const CONSANGUINEO = /\b(HERMAN[OA]S?|PADRE|MADRE|HIJ[OA]S?)\b/;
const NOTA_PARENTESCO = /MEDI[OA] HERMAN|POLITIC|ADOPT|CUNAD|MATERN|PATERN|APELLIDO|RECONOC/;
const TITULOS = /^(ING|LIC|DR|DRA|MTRO|MTRA|C|CP|ARQ|PROF|SR|SRA)$/;

function apellidos(nombreNormalizado: string): string[] {
  const partes = plano(nombreNormalizado)
    .replace(/[.,]/g, " ")
    .split(" ")
    .filter((p) => p && !TITULOS.test(p));
  return partes.slice(-2);
}

export function r05(datos: DatosReglas): Alerta[] {
  const alertas: Alerta[] = [];
  const registros = indice(datos.registros);
  const entidades = indice(datos.entidades);
  for (const v of datos.vinculos) {
    const m = CONSANGUINEO.exec(plano(v.tipo));
    const a = entidades.get(v.origen_id);
    const b = entidades.get(v.destino_id);
    const registro = v.registro_id ? registros.get(v.registro_id) : undefined;
    if (!m || !a || !b || !registro) continue;
    if (a.tipo !== "persona_fisica" || b.tipo !== "persona_fisica") continue;
    const [apA, apB] = [apellidos(a.nombre_normalizado), apellidos(b.nombre_normalizado)];
    if (apA.some((x) => apB.includes(x))) continue;
    if (NOTA_PARENTESCO.test(textoDe(registro))) continue;
    alertas.push({
      regla: "R05",
      severidad: "media",
      titulo: `Parentesco «${v.tipo}» sin apellidos en común`,
      descripcion: `${a.nombre} figura como ${m[1]?.toLowerCase()} de ${b.nombre}, pero no comparten apellidos (${apA.join(" ")} / ${apB.join(" ")}) y el registro no lo explica.`,
      huella: `R05|${v.id}`,
      entidades: [a.id, b.id],
      evidencias: [
        deRegistro(registro, "a", "Parentesco declarado", v.tipo, /TIPO.*VINCULO|VINCULO/),
        deRegistro(
          registro,
          "b",
          "Apellidos",
          `${apA.join(" ")} / ${apB.join(" ")}`,
          /ENTIDAD|NODO|NOMBRE/,
        ),
      ],
    });
  }
  return alertas;
}

// ---------------------------------------------------------------------------
// R06 · Monto pagado mayor al original sin convenio modificatorio
// ---------------------------------------------------------------------------
function tieneModificatorio(texto: string): boolean {
  const sinNegados = texto.replace(
    /\b(SIN|NO (EXISTE|HAY|CUENTA CON|SE PRESENTO))\s+(CONVENIO\s+)?MODIFICATORIO/g,
    "",
  );
  return /MODIFICATORIO/.test(sinNegados);
}

const proveedorDe = (e: EventoRegla) =>
  e.participantes.find((p) => p.rol === "destino")?.entidad_id ?? e.participantes[0]?.entidad_id;

export function r06(datos: DatosReglas): Alerta[] {
  const alertas: Alerta[] = [];
  const registros = indice(datos.registros);
  for (const e of datos.eventos) {
    if (e.tipo !== "contrato") continue;
    const original = centavos(e.monto);
    const pagado = centavos(e.monto_pagado);
    const registro = e.registro_id ? registros.get(e.registro_id) : undefined;
    if (original === null || pagado === null || !registro || original <= 0n || pagado <= original)
      continue;
    if (tieneModificatorio(textoDe(registro))) continue;
    const exceso = Number(((pagado - original) * 1000n) / original) / 10;
    const proveedor = proveedorDe(e);
    alertas.push({
      regla: "R06",
      severidad: exceso >= 50 ? "critica" : "alta",
      titulo: `Pagado ${exceso}% sobre el monto original sin convenio modificatorio`,
      descripcion: `${registro.resumen ?? "Contrato"}: original ${pesos(original)}, pagado ${pesos(pagado)} (${pesos(pagado - original)} de más). El registro no menciona un convenio modificatorio.`,
      huella: `R06|${e.id}`,
      entidades: proveedor ? [proveedor] : [],
      evidencias: [
        deRegistro(registro, "a", "Monto original", pesos(original), /MONTO.*ORIGINAL/),
        deRegistro(registro, "b", "Monto pagado", pesos(pagado), /MONTO.*PAGADO/),
      ],
    });
  }
  return alertas;
}

// ---------------------------------------------------------------------------
// R07 · Adjudicaciones directas sucesivas al mismo proveedor
// ---------------------------------------------------------------------------
const ADJUDICACION_DIRECTA = /ADJUDICACION(ES)? DIRECTAS?/;
export const MINIMO_R07 = 2;

export function r07(datos: DatosReglas): Alerta[] {
  const registros = indice(datos.registros);
  const entidades = indice(datos.entidades);
  const porProveedor = new Map<string, { evento: EventoRegla; registro: RegistroRegla }[]>();
  for (const e of datos.eventos) {
    if (e.tipo !== "contrato") continue;
    const registro = e.registro_id ? registros.get(e.registro_id) : undefined;
    const proveedor = proveedorDe(e);
    if (!registro || !proveedor) continue;
    // Solo el tipo de contrato; las observaciones pueden citar adjudicaciones de otros.
    const tipo = registro.extracciones.filter((x) => /TIPO/.test(plano(x.campo)));
    const texto = plano(
      (tipo.length ? tipo : registro.extracciones).map((x) => x.valor_crudo ?? "").join(" | "),
    );
    if (!ADJUDICACION_DIRECTA.test(texto)) continue;
    porProveedor.set(proveedor, [...(porProveedor.get(proveedor) ?? []), { evento: e, registro }]);
  }
  const alertas: Alerta[] = [];
  for (const [proveedor, contratos] of porProveedor) {
    if (contratos.length < MINIMO_R07) continue;
    contratos.sort((a, b) => (a.evento.fecha ?? "").localeCompare(b.evento.fecha ?? ""));
    const total = contratos.reduce((s, c) => s + (centavos(c.evento.monto) ?? 0n), 0n);
    alertas.push({
      regla: "R07",
      severidad: contratos.length >= 4 ? "alta" : "media",
      titulo: `${contratos.length} adjudicaciones directas al mismo proveedor`,
      descripcion: `${entidades.get(proveedor)?.nombre ?? "El proveedor"} recibió ${contratos.length} contratos por adjudicación directa por ${pesos(total)} en total.`,
      huella: `R07|${proveedor}`,
      entidades: [proveedor],
      evidencias: contratos.map((c, i) =>
        deRegistro(
          c.registro,
          i === 0 ? "a" : "b",
          `${c.registro.resumen ?? "Contrato"}${c.evento.fecha ? ` · ${c.evento.fecha.split("-").reverse().join("/")}` : ""}`,
          pesos(centavos(c.evento.monto) ?? 0n),
          /TIPO/,
        ),
      ),
    });
  }
  return alertas;
}

// ---------------------------------------------------------------------------
// R08 · Domicilio fiscal o representante legal compartido entre proveedores
// ---------------------------------------------------------------------------
const NEXO_COMPARTIBLE = /REPRESENTANTE|APODERADO|DOMICILIO/;

export function r08(datos: DatosReglas): Alerta[] {
  const registros = indice(datos.registros);
  const entidades = indice(datos.entidades);
  const proveedores = new Set(
    datos.eventos
      .filter((e) => e.tipo === "contrato")
      .map(proveedorDe)
      .filter((x): x is string => !!x),
  );
  /** nexo (persona o domicilio) → proveedor → vínculo */
  const nexos = new Map<string, Map<string, DatosReglas["vinculos"][number]>>();
  for (const v of datos.vinculos) {
    const a = entidades.get(v.origen_id);
    const b = entidades.get(v.destino_id);
    if (!a || !b) continue;
    const compartible =
      NEXO_COMPARTIBLE.test(plano(v.tipo)) || a.tipo === "domicilio" || b.tipo === "domicilio";
    if (!compartible) continue;
    for (const [nexo, empresa] of [
      [a, b],
      [b, a],
    ] as const) {
      if (empresa.tipo !== "persona_moral" || nexo.tipo === "persona_moral") continue;
      if (proveedores.size && !proveedores.has(empresa.id)) continue;
      const m = nexos.get(nexo.id) ?? new Map();
      if (!m.has(empresa.id)) m.set(empresa.id, v);
      nexos.set(nexo.id, m);
    }
  }
  const alertas: Alerta[] = [];
  for (const [nexoId, empresas] of nexos) {
    if (empresas.size < 2) continue;
    const nexo = entidades.get(nexoId);
    const ids = ordenados(empresas.keys());
    const esDomicilio = nexo?.tipo === "domicilio";
    const evidencias: EvidenciaAlerta[] = [];
    ids.forEach((id, i) => {
      const v = empresas.get(id);
      const r = v?.registro_id ? registros.get(v.registro_id) : undefined;
      if (v && r)
        evidencias.push(
          deRegistro(r, i === 0 ? "a" : "b", entidades.get(id)?.nombre ?? "Proveedor", v.tipo),
        );
    });
    if (evidencias.length < 2) continue;
    alertas.push({
      regla: "R08",
      severidad: "media",
      titulo: `${esDomicilio ? "Domicilio" : "Representante"} compartido por ${ids.length} proveedores`,
      descripcion: `${nexo?.nombre ?? "La misma entidad"} figura como ${esDomicilio ? "domicilio" : "representante o apoderado"} de ${ids.map((id) => entidades.get(id)?.nombre ?? "?").join(", ")}.`,
      huella: `R08|${nexoId}|${ids.join(",")}`,
      entidades: [nexoId, ...ids],
      evidencias,
    });
  }
  return alertas;
}

// ---------------------------------------------------------------------------
// R09 · Empresa constituida pocos días antes del contrato
// ---------------------------------------------------------------------------
export const DIAS_R09 = 90;
const RFC_MORAL = /^[A-ZÑ&]{3}(\d{2})(\d{2})(\d{2})[A-Z0-9]{3}$/;

/** Fecha de constitución según el RFC de persona moral, la más reciente que no pase de `hasta`. */
export function constitucionSegunRfc(rfc: string, hasta: string): string | null {
  const m = RFC_MORAL.exec(rfc.toUpperCase());
  if (!m) return null;
  const [, aa, mm, dd] = m;
  for (const siglo of ["20", "19"]) {
    const iso = `${siglo}${aa}-${mm}-${dd}`;
    const d = new Date(`${iso}T00:00:00Z`);
    if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) return null;
    if (iso <= hasta) return iso;
  }
  return null;
}

export function r09(datos: DatosReglas): Alerta[] {
  const alertas: Alerta[] = [];
  const registros = indice(datos.registros);
  const entidades = indice(datos.entidades);
  const vistos = new Set<string>();
  const contratos = datos.eventos
    .filter((e) => e.tipo === "contrato" && e.fecha)
    .sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));
  for (const e of contratos) {
    const proveedor = entidades.get(proveedorDe(e) ?? "");
    const registro = e.registro_id ? registros.get(e.registro_id) : undefined;
    if (!proveedor?.rfc || proveedor.tipo !== "persona_moral" || !registro || !e.fecha) continue;
    if (vistos.has(proveedor.id)) continue; // solo el primer contrato de cada empresa
    vistos.add(proveedor.id);
    const constitucion = constitucionSegunRfc(proveedor.rfc, e.fecha);
    if (!constitucion) continue;
    const dias = Math.round((Date.parse(e.fecha) - Date.parse(constitucion)) / 86_400_000);
    if (dias > DIAS_R09) continue;
    const dmy = (iso: string) => iso.split("-").reverse().join("/");
    alertas.push({
      regla: "R09",
      severidad: dias <= 30 ? "critica" : "alta",
      titulo: `Empresa constituida ${dias} días antes de su primer contrato`,
      descripcion: `${proveedor.nombre}: su RFC indica constitución el ${dmy(constitucion)} y firmó ${registro.resumen ?? "un contrato"} el ${dmy(e.fecha)}.`,
      huella: `R09|${proveedor.id}|${e.id}`,
      entidades: [proveedor.id],
      evidencias: [
        deRegistro(
          registro,
          "a",
          "Constitución según RFC",
          `${dmy(constitucion)} (${proveedor.rfc})`,
          /^RFC/,
        ),
        deRegistro(registro, "b", "Firma del contrato", dmy(e.fecha), /FECHA.*FIRMA/),
      ],
    });
  }
  return alertas;
}

// ---------------------------------------------------------------------------
// Catálogo y ejecución
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// R10 · Proveedor en lista 69-B del SAT
// ---------------------------------------------------------------------------
const SITUACION_R10: Record<string, { texto: string; severidad: Alerta["severidad"] }> = {
  definitivo: { texto: "definitivo", severidad: "critica" },
  presunto: { texto: "presunto", severidad: "alta" },
};

/**
 * Una entidad del encargo aparece en la lista 69-B en situación de presunto o definitivo. Cuenta la
 * coincidencia exacta por RFC (aunque nadie la haya revisado) y la propuesta por nombre solo si un
 * auditor la confirmó; una descartada no llega aquí. Desvirtuado y sentencia favorable no alertan.
 */
export function r10(datos: DatosReglas): Alerta[] {
  const entidades = indice(datos.entidades);
  const alertas: Alerta[] = [];
  const vistas = new Set<string>();
  for (const c of datos.coincidencias_69b ?? []) {
    const s = SITUACION_R10[c.situacion];
    if (!s || !c.registro_id || !(c.coincidencia === "exacta" || c.confirmada)) continue;
    const huella = `R10|${c.entidad_id}|${c.situacion}`;
    if (vistas.has(huella)) continue;
    vistas.add(huella);
    const e = entidades.get(c.entidad_id);
    const nombre = e?.nombre ?? c.nombre_en_lista ?? "La entidad";
    const como =
      c.coincidencia === "exacta"
        ? `por RFC${c.rfc ? ` (${c.rfc})` : ""}`
        : "por nombre, confirmada por un auditor";
    alertas.push({
      regla: "R10",
      severidad: s.severidad,
      titulo: `${nombre} aparece en la lista 69-B del SAT como ${s.texto}`,
      descripcion: `Coincidencia ${como}${c.carga ? ` en la ${c.carga}` : ""}. Las operaciones con contribuyentes en esta situación pueden carecer de efectos fiscales; revisa sus comprobantes.`,
      huella,
      entidades: [c.entidad_id],
      evidencias: [
        {
          lado: "a",
          etiqueta: "Registro donde aparece",
          valor: nombre,
          registro_id: c.registro_id,
          extraccion_id: null,
          ubicacion: null,
        },
      ],
    });
  }
  return alertas;
}

// ---------------------------------------------------------------------------
// R11 · Captura manual que difiere del documento asociado
// ---------------------------------------------------------------------------
const ETIQUETA_R11: Record<string, string> = {
  fecha_documento: "fecha del documento",
  numero_expediente: "número de expediente",
  numero_contrato: "número de contrato",
  numero_factura: "número de factura",
  numero_cuenta: "número de cuenta",
  monto: "monto",
  domicilio: "domicilio",
  telefono: "teléfono",
};

/** Valor comparable de una extracción: montos en centavos con moneda; lo demás, texto plano. */
function comparable(x: ExtraccionRegla): string {
  const v = x.valor_normalizado;
  if (v && typeof v === "object" && !Array.isArray(v) && "monto" in v) {
    const m = v as { monto?: unknown; moneda?: unknown };
    const c = centavos(m.monto);
    if (c !== null) return `${c} ${typeof m.moneda === "string" ? m.moneda : ""}`.trim();
  }
  const texto = typeof v === "string" || typeof v === "number" ? String(v) : (x.valor_crudo ?? "");
  // Sin puntuación ni espacios: «SOP-001» y «SOP 001» son el mismo número.
  return plano(texto).replace(/[^A-Z0-9]/g, "");
}

/**
 * Compara, campo por campo, lo que se capturó a mano con lo que la IA leyó del documento que
 * después se asoció a esa captura. Una alerta por cada diferencia. Los involucrados no se comparan
 * aquí: su orden y forma de escribirse cambian entre fuentes.
 */
export function r11(datos: DatosReglas): Alerta[] {
  const alertas: Alerta[] = [];
  for (const r of datos.registros) {
    for (const leida of r.lecturas_documento ?? []) {
      if (/^involucrado_\d+$/.test(leida.campo)) continue;
      const capturada = r.extracciones.find((x) => x.campo === leida.campo);
      if (!capturada) continue;
      const a = comparable(capturada);
      const b = comparable(leida);
      if (!a || !b || a === b) continue;
      const etiqueta = ETIQUETA_R11[leida.campo] ?? plano(leida.campo).toLowerCase();
      alertas.push({
        regla: "R11",
        severidad: leida.campo === "monto" ? "alta" : "media",
        titulo: `La captura y su documento difieren en ${etiqueta}`,
        descripcion: `Se capturó «${capturada.valor_crudo ?? ""}» y el documento asociado dice «${leida.valor_crudo ?? ""}». Revisa cuál es el dato correcto.`,
        huella: `R11|${r.id}|${leida.campo}`,
        entidades: [],
        evidencias: [
          {
            lado: "a",
            etiqueta: `Captura manual · ${etiqueta}`,
            valor: capturada.valor_crudo ?? "",
            registro_id: r.id,
            extraccion_id: capturada.id,
            ubicacion: capturada.ubicacion,
          },
          {
            lado: "b",
            etiqueta: `Documento asociado · ${etiqueta}`,
            valor: leida.valor_crudo ?? "",
            registro_id: r.id,
            extraccion_id: leida.id,
            ubicacion: leida.ubicacion,
          },
        ],
      });
    }
  }
  return alertas;
}

// ---------------------------------------------------------------------------
// R12 · Verificación en campo: el proveedor no existe donde dice
// ---------------------------------------------------------------------------
const fechaCampo = new Intl.DateTimeFormat("es-MX", {
  timeZone: "America/Mexico_City",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

/**
 * Cada «no» de una cédula de campo es una alerta (no un hallazgo): la confirma o descarta un
 * auditor. «No se pudo verificar» no alerta. La evidencia es el registro de la cédula, que a su vez
 * lleva las fotos con ubicación, hora y SHA-256.
 */
export function r12(datos: DatosReglas): Alerta[] {
  const alertas: Alerta[] = [];
  for (const c of datos.verificaciones_campo ?? []) {
    const cuando = Number.isNaN(Date.parse(c.capturada_en))
      ? c.capturada_en
      : fechaCampo.format(new Date(c.capturada_en));
    for (const p of PREGUNTAS_CAMPO) {
      if (c.respuestas[p.clave] !== "no") continue;
      alertas.push({
        regla: "R12",
        severidad: p.severidad,
        titulo: `${c.entidad}: ${p.hallazgo}`,
        descripcion: `Verificación en campo del ${cuando} (${c.evidencias} foto(s) con ubicación y huella). Respuesta «No coincide» a: ${p.pregunta}`,
        huella: `R12|${c.entidad_id}|${p.clave}`,
        entidades: [c.entidad_id],
        evidencias: [
          {
            lado: "a",
            etiqueta: "Cédula de verificación en campo",
            valor: p.hallazgo,
            registro_id: c.registro_id,
            extraccion_id: null,
            ubicacion: null,
          },
        ],
      });
    }
  }
  return alertas;
}

export const REGLAS: Regla[] = [
  {
    id: "R01",
    nombre: "Total declarado distinto de la suma del detalle",
    activa: true,
    evaluar: r01,
  },
  { id: "R02", nombre: "Mismo concepto con cifras distintas", activa: true, evaluar: r02 },
  {
    id: "R03",
    nombre: "Afirmación cuantitativa sin respaldo en eventos",
    activa: true,
    evaluar: r03,
  },
  {
    id: "R04",
    nombre: "Suma de eventos distinta de la cifra reportada",
    activa: true,
    evaluar: r04,
  },
  { id: "R05", nombre: "Parentesco con apellidos incompatibles", activa: true, evaluar: r05 },
  {
    id: "R06",
    nombre: "Pagado mayor al original sin convenio modificatorio",
    activa: true,
    evaluar: r06,
  },
  {
    id: "R07",
    nombre: "Adjudicaciones directas sucesivas al mismo proveedor",
    activa: true,
    evaluar: r07,
  },
  {
    id: "R08",
    nombre: "Domicilio o representante compartido entre proveedores",
    activa: true,
    evaluar: r08,
  },
  {
    id: "R09",
    nombre: "Empresa constituida pocos días antes del contrato",
    activa: true,
    evaluar: r09,
  },
  {
    id: "R10",
    nombre: "Proveedor en lista 69-B del SAT",
    activa: true,
    evaluar: r10,
  },
  {
    id: "R11",
    nombre: "Captura manual que difiere del documento asociado",
    activa: true,
    evaluar: r11,
  },
  {
    id: "R12",
    nombre: "Verificación en campo: el proveedor no existe donde declara",
    activa: true,
    evaluar: r12,
  },
];

export const NOMBRE_REGLA: Record<string, string> = Object.fromEntries(
  REGLAS.map((r) => [r.id, r.nombre]),
);

/** Ejecuta las reglas activas. Devuelve las alertas y los IDs de las reglas que corrieron. */
export function ejecutarReglas(datos: DatosReglas): { alertas: Alerta[]; reglas: string[] } {
  const activas = REGLAS.filter((r) => r.activa);
  return { alertas: activas.flatMap((r) => r.evaluar(datos)), reglas: activas.map((r) => r.id) };
}
