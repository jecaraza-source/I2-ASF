/**
 * Validación de extracciones (§7.2): compara lo que confirmó el auditor en el formulario con lo
 * que leyó la IA y decide, campo por campo, si se aceptó, se corrigió o se rechazó. Funciones puras.
 */
import { construirCaptura, type CargaCaptura } from "./captura";

/** Una lectura de la IA tal como está guardada en `extraccion`. */
export type LecturaIA = {
  id: string;
  campo: string;
  valor_crudo: string | null;
  valor_normalizado: unknown;
};

export type DecisionLectura = {
  extraccion_id: string;
  estado: "validado" | "corregido" | "rechazado";
  /** Solo si se corrigió: el valor que queda. */
  valor_crudo: string | null;
  valor_normalizado: unknown;
};

export type CargaValidacion = {
  registro_id: string;
  expediente_id: string | null;
  fecha_documento: string | null;
  resumen: string;
  decisiones: DecisionLectura[];
  nuevas: CargaCaptura["campos"];
  involucrados: (CargaCaptura["involucrados"][number] & { campo: string })[];
  evento: CargaCaptura["evento"];
};

export type ResultadoValidacion =
  | { ok: true; carga: CargaValidacion }
  | { ok: false; mensaje: string; errores: Record<string, string> };

const INVOLUCRADO = /^involucrado_(\d+)$/;

/** Forma canónica para comparar valores normalizados (orden de llaves estable). */
function canon(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (typeof v === "string") return JSON.stringify(v.trim());
  if (Array.isArray(v)) return `[${v.map(canon).join(",")}]`;
  if (typeof v === "object") {
    return `{${Object.entries(v as Record<string, unknown>)
      .filter(([, x]) => x !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, x]) => `${JSON.stringify(k)}:${canon(x)}`)
      .join(",")}}`;
  }
  return JSON.stringify(v);
}

/** El nombre tal como venía en el documento no cuenta para saber si el auditor cambió algo. */
function sinOriginal(v: unknown): unknown {
  if (!v || typeof v !== "object" || Array.isArray(v)) return v;
  return Object.fromEntries(
    Object.entries(v as Record<string, unknown>).filter(
      ([k]) => k !== "nombre_original" && k !== "aportacion_texto",
    ),
  );
}

/**
 * Arma la carga de `validar_registro`.
 *  - Un campo que el auditor dejó igual queda `validado`; si lo cambió, `corregido` (la base
 *    conserva lo que leyó la IA); si lo vació o lo quitó, `rechazado`.
 *  - Lo que agregó el auditor entra como dato nuevo, capturado a mano.
 *  - Toda lectura recibe una decisión.
 */
export function construirValidacion(
  entrada: unknown,
  tipo: { clave: string; nombre: string; campos_esperados: unknown },
  registroId: string,
  lecturas: LecturaIA[],
): ResultadoValidacion {
  const base = entrada && typeof entrada === "object" ? (entrada as Record<string, unknown>) : {};
  // Un documento no declara fuente: la fuente es el propio archivo.
  const r = construirCaptura({ ...base, fuente: "documento" }, tipo, "documento");
  if (!r.ok) return r;
  const { carga } = r;
  const pedidos = Array.isArray(base.involucrados) ? base.involucrados : [];
  const campoIaDe = (i: number): string | null => {
    const v = (pedidos[i] as { campoIa?: unknown } | undefined)?.campoIa;
    return typeof v === "string" ? v : null;
  };

  const porCampo = new Map(lecturas.map((l) => [l.campo, l]));
  const decididas = new Map<string, DecisionLectura>();
  const nuevas: CargaCaptura["campos"] = [];
  const decidir = (l: LecturaIA, final: CargaCaptura["campos"][number]) => {
    const igual = canon(sinOriginal(l.valor_normalizado)) === canon(final.valor_normalizado);
    decididas.set(l.id, {
      extraccion_id: l.id,
      estado: igual ? "validado" : "corregido",
      valor_crudo: igual ? null : final.valor_crudo,
      valor_normalizado: igual ? null : final.valor_normalizado,
    });
  };

  // Campos sueltos: se emparejan por clave.
  for (const final of carga.campos) {
    if (INVOLUCRADO.test(final.campo)) continue;
    const l = porCampo.get(final.campo);
    if (l) decidir(l, final);
    else nuevas.push(final);
  }

  // Involucrados: se emparejan por la lectura de la que vienen, no por su posición.
  let siguiente =
    Math.max(0, ...lecturas.map((l) => Number(INVOLUCRADO.exec(l.campo)?.[1] ?? 0))) + 1;
  const errores: Record<string, string> = {};
  const involucrados = carga.involucrados.map((inv, i) => {
    const final = carga.campos.find((c) => c.campo === `involucrado_${i + 1}`);
    const pedido = campoIaDe(i);
    const l = pedido ? porCampo.get(pedido) : undefined;
    if (final && l && INVOLUCRADO.test(l.campo) && !decididas.has(l.id)) {
      decidir(l, final);
      return { ...inv, campo: l.campo };
    }
    if (pedido && l && decididas.has(l.id)) {
      errores[`involucrados.${i}.nombre`] = "Este involucrado está repetido";
    }
    const campo = `involucrado_${siguiente++}`;
    if (final) nuevas.push({ ...final, campo });
    return { ...inv, campo };
  });
  if (Object.keys(errores).length) {
    return { ok: false, mensaje: "Revisa los campos marcados.", errores };
  }

  // Lo que no quedó en el formulario se rechaza.
  for (const l of lecturas) {
    if (!decididas.has(l.id)) {
      decididas.set(l.id, {
        extraccion_id: l.id,
        estado: "rechazado",
        valor_crudo: null,
        valor_normalizado: null,
      });
    }
  }

  return {
    ok: true,
    carga: {
      registro_id: registroId,
      expediente_id: carga.expediente_id,
      fecha_documento: carga.fecha_documento,
      resumen: carga.resumen,
      decisiones: lecturas.map((l) => decididas.get(l.id) as DecisionLectura),
      nuevas,
      involucrados,
      evento: carga.evento,
    },
  };
}
