/**
 * Captura manual (§6): definición de campos, validación de la entrada del formulario y
 * construcción de la carga que guarda `capturar_registro`. Funciones puras.
 * El mismo formulario valida extracciones de IA en la tarea 09.
 */
import { z } from "zod";
import {
  agregarIdentificador,
  normalizarFecha,
  normalizarMonto,
  normalizarNombre,
  type Identificadores,
} from "./normalizacion";

// ---------------------------------------------------------------------------
// Campos
// ---------------------------------------------------------------------------
export const TIPOS_CAMPO = ["texto", "texto_largo", "fecha", "monto", "numero"] as const;
export type TipoCampo = (typeof TIPOS_CAMPO)[number];

/** Un elemento de `tipo_documento.campos_esperados`. */
export const campoEsperadoSchema = z.object({
  clave: z.string().regex(/^[a-z][a-z0-9_]{0,59}$/),
  etiqueta: z.string().trim().min(1).max(80),
  tipo: z.enum(TIPOS_CAMPO),
  requerido: z.boolean().optional(),
});
export type CampoEsperado = z.infer<typeof campoEsperadoSchema>;

/** Lee `campos_esperados` de la base; lo que no cumple el formato se descarta. */
export function leerCamposEsperados(valor: unknown): CampoEsperado[] {
  if (!Array.isArray(valor)) return [];
  const vistos = new Set<string>(CAMPOS_COMUNES.map((c) => c.clave));
  const campos: CampoEsperado[] = [];
  for (const v of valor) {
    const c = campoEsperadoSchema.safeParse(v);
    if (c.success && !vistos.has(c.data.clave)) {
      vistos.add(c.data.clave);
      campos.push(c.data);
    }
  }
  return campos;
}

/** Campos comunes de todo registro (§6). La moneda acompaña al monto. */
export const CAMPOS_COMUNES: readonly CampoEsperado[] = [
  { clave: "fecha_documento", etiqueta: "Fecha del documento", tipo: "fecha" },
  { clave: "numero_expediente", etiqueta: "Número de expediente", tipo: "texto" },
  { clave: "numero_contrato", etiqueta: "Número de contrato", tipo: "texto" },
  { clave: "numero_factura", etiqueta: "Número de factura", tipo: "texto" },
  { clave: "numero_cuenta", etiqueta: "Número de cuenta", tipo: "texto" },
  { clave: "monto", etiqueta: "Monto", tipo: "monto" },
  { clave: "domicilio", etiqueta: "Domicilio", tipo: "texto_largo" },
  { clave: "telefono", etiqueta: "Teléfono", tipo: "texto" },
];

export const MONEDAS = ["MXN", "USD", "EUR"] as const;

export const TIPOS_INVOLUCRADO = ["persona_moral", "persona_fisica", "dependencia"] as const;
export const NOMBRE_TIPO_INVOLUCRADO: Record<(typeof TIPOS_INVOLUCRADO)[number], string> = {
  persona_moral: "Empresa",
  persona_fisica: "Persona",
  dependencia: "Dependencia",
};

export const ROLES_INVOLUCRADO = [
  "proveedor",
  "dependencia",
  "representante_legal",
  "apoderado",
  "socio",
  "funcionario",
  "notario",
  "ordenante",
  "beneficiario",
  "titular",
  "otro",
] as const;
export type RolInvolucrado = (typeof ROLES_INVOLUCRADO)[number];
export const NOMBRE_ROL: Record<RolInvolucrado, string> = {
  proveedor: "Proveedor",
  dependencia: "Dependencia contratante",
  representante_legal: "Representante legal",
  apoderado: "Apoderado",
  socio: "Socio o accionista",
  funcionario: "Funcionario",
  notario: "Notario",
  ordenante: "Ordenante",
  beneficiario: "Beneficiario",
  titular: "Titular",
  otro: "Otro",
};

// ---------------------------------------------------------------------------
// Entrada del formulario
// ---------------------------------------------------------------------------
const uuid = z.uuid();

export const involucradoSchema = z.object({
  tipo: z.enum(TIPOS_INVOLUCRADO),
  nombre: z.string().trim().min(2, "Escribe el nombre del involucrado").max(200),
  rol: z.enum(ROLES_INVOLUCRADO),
  rfc: z.string().trim().max(20).optional().default(""),
  curp: z.string().trim().max(20).optional().default(""),
});
export type Involucrado = z.infer<typeof involucradoSchema>;

export const capturaSchema = z.object({
  encargoId: uuid,
  tipoDocumentoId: z.uuid("Elige el tipo de documento"),
  expedienteId: uuid.nullable().optional().default(null),
  fuente: z.string().trim().min(1, "La fuente declarada es obligatoria").max(200),
  moneda: z.enum(MONEDAS).optional().default("MXN"),
  /** clave del campo → texto tal como lo escribió el auditor. */
  valores: z.record(z.string(), z.string().max(4000)),
  involucrados: z.array(involucradoSchema).max(40),
});
export type EntradaCaptura = z.input<typeof capturaSchema>;

// ---------------------------------------------------------------------------
// Carga para `capturar_registro`
// ---------------------------------------------------------------------------
export type CargaCaptura = {
  encargo_id: string;
  tipo_documento_id: string;
  expediente_id: string | null;
  fuente: string;
  fecha_documento: string | null;
  resumen: string;
  campos: { campo: string; valor_crudo: string; valor_normalizado: unknown }[];
  involucrados: {
    tipo: string;
    nombre: string;
    nombre_normalizado: string;
    rol: string;
    identificadores: Identificadores;
  }[];
  evento: {
    tipo: "contrato" | "transferencia";
    fecha_hora: string | null;
    monto: string | null;
    moneda: string | null;
    atributos: Record<string, string>;
    /** Índice en `involucrados` y su papel en el evento. */
    participantes: { indice: number; rol: "origen" | "destino" | "parte" }[];
  } | null;
};

export type ResultadoCaptura =
  | { ok: true; carga: CargaCaptura }
  | { ok: false; mensaje: string; errores: Record<string, string> };

/** Qué evento produce una captura según la clave del tipo de documento. */
const EVENTO_POR_TIPO: Record<
  string,
  { tipo: "contrato" | "transferencia"; origen: RolInvolucrado; destino: RolInvolucrado }
> = {
  contrato: { tipo: "contrato", origen: "dependencia", destino: "proveedor" },
  comprobante_transferencia: {
    tipo: "transferencia",
    origen: "ordenante",
    destino: "beneficiario",
  },
};

function normalizar(campo: CampoEsperado, crudo: string): { valor: unknown; error?: string } {
  switch (campo.tipo) {
    case "fecha": {
      const f = normalizarFecha(crudo);
      return f ? { valor: f } : { valor: null, error: "Fecha inválida (usa dd/mm/aaaa)" };
    }
    case "monto": {
      const m = normalizarMonto(crudo);
      return m ? { valor: m } : { valor: null, error: "Monto inválido" };
    }
    case "numero": {
      const n = Number(crudo.replace(/,/g, ""));
      return Number.isFinite(n) ? { valor: n } : { valor: null, error: "Número inválido" };
    }
    default:
      return { valor: crudo };
  }
}

/**
 * Valida lo capturado contra los campos del tipo de documento y arma la carga.
 * Un RFC o CURP con formato inválido no bloquea: se conserva y se marca (§5).
 */
export function construirCaptura(
  entrada: unknown,
  tipo: { clave: string; nombre: string; campos_esperados: unknown },
): ResultadoCaptura {
  const p = capturaSchema.safeParse(entrada);
  if (!p.success) {
    const errores: Record<string, string> = {};
    for (const i of p.error.issues) errores[i.path.join(".")] ??= i.message;
    return { ok: false, mensaje: p.error.issues[0]?.message ?? "Datos inválidos", errores };
  }
  const d = p.data;
  const campos = [...CAMPOS_COMUNES, ...leerCamposEsperados(tipo.campos_esperados)];
  const errores: Record<string, string> = {};
  const carga: CargaCaptura["campos"] = [];
  const normalizados = new Map<string, unknown>();

  for (const campo of campos) {
    const crudo = (d.valores[campo.clave] ?? "").trim();
    if (!crudo) {
      if (campo.requerido)
        errores[`valores.${campo.clave}`] = `Falta ${campo.etiqueta.toLowerCase()}`;
      continue;
    }
    const n = normalizar(campo, crudo);
    if (n.error) {
      errores[`valores.${campo.clave}`] = n.error;
      continue;
    }
    normalizados.set(campo.clave, n.valor);
    carga.push({
      campo: campo.clave,
      valor_crudo: crudo,
      valor_normalizado: campo.tipo === "monto" ? { monto: n.valor, moneda: d.moneda } : n.valor,
    });
  }

  const involucrados: CargaCaptura["involucrados"] = [];
  const vistos = new Set<string>();
  d.involucrados.forEach((inv, i) => {
    const nombre = inv.nombre.replace(/\s+/g, " ").trim();
    const normalizado = normalizarNombre(nombre);
    if (!normalizado) {
      errores[`involucrados.${i}.nombre`] = "Nombre inválido";
      return;
    }
    const clave = `${inv.tipo}|${normalizado}|${inv.rol}`;
    if (vistos.has(clave)) {
      errores[`involucrados.${i}.nombre`] = "Este involucrado está repetido con el mismo rol";
      return;
    }
    vistos.add(clave);
    let ids: Identificadores = {};
    if (inv.rfc) ids = agregarIdentificador(ids, "rfc", inv.rfc);
    if (inv.curp) ids = agregarIdentificador(ids, "curp", inv.curp);
    involucrados.push({
      tipo: inv.tipo,
      nombre,
      nombre_normalizado: normalizado,
      rol: inv.rol,
      identificadores: ids,
    });
    carga.push({
      campo: `involucrado_${i + 1}`,
      valor_crudo: [nombre, NOMBRE_ROL[inv.rol], inv.rfc, inv.curp].filter(Boolean).join(" · "),
      valor_normalizado: { nombre: normalizado, tipo: inv.tipo, rol: inv.rol, ...ids },
    });
  });

  if (Object.keys(errores).length) {
    return { ok: false, mensaje: "Revisa los campos marcados.", errores };
  }
  if (!carga.length) {
    return { ok: false, mensaje: "Captura al menos un dato o un involucrado.", errores: {} };
  }

  const fecha = (normalizados.get("fecha_documento") as string | undefined) ?? null;
  const monto = (normalizados.get("monto") as string | undefined) ?? null;
  const regla = EVENTO_POR_TIPO[tipo.clave];
  let evento: CargaCaptura["evento"] = null;
  if (regla && involucrados.length >= 2) {
    const texto = (k: string) => {
      const v = normalizados.get(k);
      return typeof v === "string" && v ? v : null;
    };
    const atributos: Record<string, string> = {};
    for (const [k, v] of [
      ["numero", texto("numero_contrato")],
      ["monto_pagado", texto("monto_pagado")],
      ["tipo_operacion", texto("tipo_operacion")],
      ["origen", "captura"],
    ] as const)
      if (v) atributos[k] = v;
    evento = {
      tipo: regla.tipo,
      // Las fechas sin hora se anclan al inicio del día en México (§5).
      fecha_hora: fecha ? `${fecha}T00:00:00-06:00` : null,
      monto,
      moneda: monto ? d.moneda : null,
      atributos,
      participantes: involucrados.map((inv, indice) => ({
        indice,
        rol: inv.rol === regla.origen ? "origen" : inv.rol === regla.destino ? "destino" : "parte",
      })),
    };
  }

  const referencia = ["numero_contrato", "numero_factura", "numero_expediente"]
    .map((k) => normalizados.get(k))
    .find((v) => typeof v === "string" && v) as string | undefined;
  return {
    ok: true,
    carga: {
      encargo_id: d.encargoId,
      tipo_documento_id: d.tipoDocumentoId,
      expediente_id: d.expedienteId ?? null,
      fuente: d.fuente,
      fecha_documento: fecha,
      resumen: `${tipo.nombre}${referencia ? ` ${referencia}` : ""} (captura manual)`.slice(0, 255),
      campos: carga,
      involucrados,
      evento,
    },
  };
}
