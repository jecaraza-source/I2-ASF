/**
 * Indicadores, diferencias entre generaciones y fusiones propuestas.
 */
import { canonicas } from "./generacion";
import type { Calificacion, DatosRed, EntidadRed, Nivel, RedGenerada } from "./tipos";

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase();

export type Indicadores = {
  nodos: number;
  vinculos: number;
  eventos: number;
  /** Entidades únicas declaradas fantasma, fachada u offshore (nunca filas). */
  fantasma_offshore: number;
  por_nivel: Record<Nivel, number>;
};

export function indicadores(
  red: RedGenerada,
  datos: DatosRed,
  calificaciones: Calificacion[],
): Indicadores {
  const canon = canonicas(datos.entidades);
  const enRed = new Set(red.nodos.map((n) => n.entidad_id));
  const fantasmas = new Set<string>();
  for (const e of datos.entidades) {
    const k = canon.get(e.id) ?? e.id;
    if (
      enRed.has(k) &&
      e.tipos_declarados.some((t) => /FANTASMA|FACHADA|OFFSHORE/.test(sinAcentos(t)))
    ) {
      fantasmas.add(k);
    }
  }
  const por_nivel: Record<Nivel, number> = { critico: 0, alto: 0, medio: 0, bajo: 0 };
  for (const c of calificaciones) if (c.objeto_tipo === "entidad") por_nivel[c.nivel]++;
  return {
    nodos: red.nodos.length,
    vinculos: red.vinculos.length,
    eventos: red.eventos.length,
    fantasma_offshore: fantasmas.size,
    por_nivel,
  };
}

// ---------------------------------------------------------------------------
// Diferencias contra la generación anterior
// ---------------------------------------------------------------------------

export type Generacion = {
  nodos: string[];
  vinculos: string[];
  calificaciones: { objeto_tipo: string; objeto_id: string; puntaje: number; nivel: Nivel }[];
};

export type CambioCalificacion = {
  objeto_tipo: string;
  objeto_id: string;
  antes: { puntaje: number; nivel: Nivel };
  despues: { puntaje: number; nivel: Nivel };
};

export type Diferencias = {
  nodos_agregados: string[];
  nodos_quitados: string[];
  vinculos_agregados: string[];
  vinculos_quitados: string[];
  subieron: CambioCalificacion[];
  bajaron: CambioCalificacion[];
};

export function diferencias(anterior: Generacion, actual: Generacion): Diferencias {
  const resta = (a: string[], b: string[]) => {
    const sb = new Set(b);
    return a.filter((x) => !sb.has(x)).sort();
  };
  const previas = new Map(
    anterior.calificaciones.map((c) => [`${c.objeto_tipo}:${c.objeto_id}`, c]),
  );
  const subieron: CambioCalificacion[] = [];
  const bajaron: CambioCalificacion[] = [];
  for (const c of actual.calificaciones) {
    const p = previas.get(`${c.objeto_tipo}:${c.objeto_id}`);
    if (!p || p.puntaje === c.puntaje) continue;
    const cambio = {
      objeto_tipo: c.objeto_tipo,
      objeto_id: c.objeto_id,
      antes: { puntaje: p.puntaje, nivel: p.nivel },
      despues: { puntaje: c.puntaje, nivel: c.nivel },
    };
    (c.puntaje > p.puntaje ? subieron : bajaron).push(cambio);
  }
  return {
    nodos_agregados: resta(actual.nodos, anterior.nodos),
    nodos_quitados: resta(anterior.nodos, actual.nodos),
    vinculos_agregados: resta(actual.vinculos, anterior.vinculos),
    vinculos_quitados: resta(anterior.vinculos, actual.vinculos),
    subieron,
    bajaron,
  };
}

// ---------------------------------------------------------------------------
// Fusiones propuestas (§9: solo por nombre parecido; nunca se fusiona sola)
// ---------------------------------------------------------------------------

export type FusionPropuesta = { entidad_a: string; entidad_b: string; motivo: string };

const sinParentesis = (s: string) =>
  s
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const VACIAS = new Set(["DE", "DEL", "LA", "LAS", "LOS", "Y", "EL", "E"]);
const fichas = (s: string) =>
  new Set(
    sinParentesis(s)
      .split(/[\s—\-/]+/)
      .filter((t) => t.length > 1 && !VACIAS.has(t)),
  );

function jaccard(a: Set<string>, b: Set<string>): number {
  let comun = 0;
  for (const x of a) if (b.has(x)) comun++;
  return comun / (a.size + b.size - comun || 1);
}

function rfc(e: EntidadRed): string | undefined {
  return e.identificadores.rfc && !e.identificadores.invalidos?.includes("rfc")
    ? e.identificadores.rfc
    : undefined;
}

/**
 * Pares de entidades canónicas con nombres parecidos pero no idénticos (los
 * idénticos ya se resolvieron al importar). Excluye pares ya propuestos o
 * resueltos y pares con RFC válido distinto.
 */
export function proponerFusiones(
  entidades: EntidadRed[],
  paresExistentes: { entidad_a: string; entidad_b: string }[],
  umbral = 0.75,
): FusionPropuesta[] {
  const vistos = new Set(paresExistentes.map((p) => [p.entidad_a, p.entidad_b].sort().join("|")));
  const candidatas = entidades
    .filter((e) => !e.fusionada_en && e.tipo !== "telefono")
    .map((e) => ({ e, base: sinParentesis(e.nombre_normalizado), f: fichas(e.nombre_normalizado) }))
    .filter((x) => x.f.size >= 2);
  const propuestas: FusionPropuesta[] = [];
  for (let i = 0; i < candidatas.length; i++) {
    for (let j = i + 1; j < candidatas.length; j++) {
      const a = candidatas[i];
      const b = candidatas[j];
      if (!a || !b) continue;
      const llave = [a.e.id, b.e.id].sort().join("|");
      if (vistos.has(llave)) continue;
      const [ra, rb] = [rfc(a.e), rfc(b.e)];
      if (ra && rb && ra !== rb) continue;
      let motivo: string | null = null;
      if (a.base === b.base) motivo = "Mismo nombre sin el texto entre paréntesis";
      else {
        const s = jaccard(a.f, b.f);
        if (s >= umbral)
          motivo = `Nombres parecidos (${Math.round(s * 100)}% de palabras en común)`;
      }
      if (motivo) {
        // La entidad con más identificadores (o la de nombre más corto) queda como A.
        const [x, y] =
          Object.keys(a.e.identificadores).length >= Object.keys(b.e.identificadores).length
            ? [a, b]
            : [b, a];
        propuestas.push({ entidad_a: x.e.id, entidad_b: y.e.id, motivo });
        vistos.add(llave);
      }
    }
  }
  return propuestas;
}
