/**
 * Calificación de entidades y vínculos (docs/ESPECIFICACION.md §9).
 * Los criterios y pesos vienen de regla_calificacion; si la organización no
 * tiene reglas se usan las provisionales de §9 (versión 0).
 * Puntaje = suma con tope en 100. Niveles: crítico ≥ 75, alto ≥ 50, medio ≥ 25.
 */
import { canonicas } from "./generacion";
import type {
  Calificacion,
  Criterio,
  DatosRed,
  EntidadRed,
  Nivel,
  RedGenerada,
  ReglaCalificacion,
} from "./tipos";

export const REGLAS_POR_DEFECTO: ReglaCalificacion[] = [
  {
    criterio: "riesgo_declarado",
    peso: 60,
    parametros: { niveles: { CRITICO: 60, ALTO: 40, MEDIO: 20 } },
  },
  { criterio: "tipo_declarado", peso: 30, parametros: { patron: "FANTASMA|FACHADA|OFFSHORE" } },
  {
    criterio: "alertas_abiertas",
    peso: 15,
    parametros: { reglas: ["R06", "R07", "R08", "R09", "R10"] },
  },
  { criterio: "vinculo_fuerte_con_critico", peso: 10, parametros: { fuerza_minima: 7 } },
  { criterio: "evento_con_etapa", peso: 20, parametros: {} },
  { criterio: "fuerza_vinculo", peso: 8, parametros: {} },
];

export const DESCRIPCION_CRITERIO: Record<string, string> = {
  riesgo_declarado: "Riesgo declarado en la fuente",
  tipo_declarado: "Tipo declarado como fantasma, fachada u offshore",
  alertas_abiertas: "Alertas abiertas de R06–R10",
  vinculo_fuerte_con_critico: "Vínculo fuerte con una entidad crítica",
  evento_con_etapa: "Evento con etapa o alerta financiera entre los extremos",
  fuerza_vinculo: "Fuerza del vínculo",
};

export function nivelDe(puntaje: number): Nivel {
  if (puntaje >= 75) return "critico";
  if (puntaje >= 50) return "alto";
  if (puntaje >= 25) return "medio";
  return "bajo";
}

const sinAcentos = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().trim();

function regla(reglas: ReglaCalificacion[], criterio: string): ReglaCalificacion | undefined {
  return reglas.find((r) => r.criterio === criterio);
}

function numero(v: unknown, porDefecto: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : porDefecto;
}

function cerrar(
  objeto_tipo: Calificacion["objeto_tipo"],
  objeto_id: string,
  criterios: Criterio[],
): Calificacion {
  const suma = criterios.reduce((s, c) => s + c.aporte, 0);
  const puntaje = Math.min(100, Math.round(suma * 100) / 100);
  return { objeto_tipo, objeto_id, puntaje, nivel: nivelDe(puntaje), criterios };
}

export function calificar(
  red: RedGenerada,
  datos: DatosRed,
  reglas: ReglaCalificacion[],
): Calificacion[] {
  const canon = canonicas(datos.entidades);
  const c = (id: string) => canon.get(id) ?? id;
  const entidades = new Map<string, EntidadRed>(datos.entidades.map((e) => [e.id, e]));
  // Tipos declarados y riesgo de las entidades fusionadas se suman a la canónica.
  const tiposPorCanonica = new Map<string, Set<string>>();
  const riesgoPorCanonica = new Map<string, string>();
  for (const e of datos.entidades) {
    const k = c(e.id);
    const tipos = tiposPorCanonica.get(k) ?? new Set<string>();
    e.tipos_declarados.forEach((t) => tipos.add(t));
    tiposPorCanonica.set(k, tipos);
    if (e.riesgo_declarado && !riesgoPorCanonica.has(k))
      riesgoPorCanonica.set(k, e.riesgo_declarado);
  }

  const vinculosRed = new Set(red.vinculos);
  const vinculos = datos.vinculos.filter((v) => vinculosRed.has(v.id));
  const eventosRed = new Set(red.eventos);
  const eventos = datos.eventos.filter((e) => eventosRed.has(e.id));

  // --- Entidades: primera pasada (criterios propios) ---
  const rRiesgo = regla(reglas, "riesgo_declarado");
  const rTipo = regla(reglas, "tipo_declarado");
  const rAlertas = regla(reglas, "alertas_abiertas");
  const reglasAlerta = new Set(
    Array.isArray(rAlertas?.parametros.reglas) ? (rAlertas?.parametros.reglas as string[]) : [],
  );
  const patronTipo = rTipo
    ? new RegExp(String(rTipo.parametros.patron ?? "FANTASMA|FACHADA|OFFSHORE"))
    : null;

  const criteriosEntidad = new Map<string, Criterio[]>();
  for (const { entidad_id } of red.nodos) {
    const criterios: Criterio[] = [];
    const riesgo = riesgoPorCanonica.get(entidad_id);
    if (rRiesgo && riesgo) {
      const niveles = (rRiesgo.parametros.niveles ?? {}) as Record<string, unknown>;
      const aporte = numero(niveles[sinAcentos(riesgo)], 0);
      if (aporte > 0)
        criterios.push({ criterio: "riesgo_declarado", aporte, detalle: `Riesgo ${riesgo}` });
    }
    const tipos = [...(tiposPorCanonica.get(entidad_id) ?? [])];
    const tipoCoincide = patronTipo ? tipos.find((t) => patronTipo.test(sinAcentos(t))) : undefined;
    if (rTipo && tipoCoincide) {
      criterios.push({
        criterio: "tipo_declarado",
        aporte: rTipo.peso,
        detalle: `Declarada como ${tipoCoincide}`,
      });
    }
    if (rAlertas) {
      const abiertas = datos.alertas.filter(
        (a) =>
          a.estado === "abierta" &&
          reglasAlerta.has(a.regla) &&
          a.entidades.some((e) => c(e) === entidad_id),
      );
      if (abiertas.length) {
        criterios.push({
          criterio: "alertas_abiertas",
          aporte: rAlertas.peso * abiertas.length,
          detalle: `${abiertas.length} alerta(s): ${[...new Set(abiertas.map((a) => a.regla))].join(", ")}`,
        });
      }
    }
    criteriosEntidad.set(entidad_id, criterios);
  }

  // --- Entidades: segunda pasada (vínculo fuerte con una entidad crítica) ---
  const rFuerte = regla(reglas, "vinculo_fuerte_con_critico");
  if (rFuerte) {
    const minima = numero(rFuerte.parametros.fuerza_minima, 7);
    const criticas = new Set(
      [...criteriosEntidad.entries()]
        .filter(([, cs]) => nivelDe(cs.reduce((s, x) => s + x.aporte, 0)) === "critico")
        .map(([id]) => id),
    );
    for (const [id, criterios] of criteriosEntidad) {
      const con = vinculos.find((v) => {
        if ((v.fuerza ?? 0) < minima) return false;
        const [o, d] = [c(v.origen_id), c(v.destino_id)];
        return (o === id && criticas.has(d)) || (d === id && criticas.has(o));
      });
      if (con) {
        const otra = c(con.origen_id) === id ? c(con.destino_id) : c(con.origen_id);
        criterios.push({
          criterio: "vinculo_fuerte_con_critico",
          aporte: rFuerte.peso,
          detalle: `Vínculo ${con.tipo} (fuerza ${con.fuerza}) con ${entidades.get(otra)?.nombre ?? otra}`,
        });
      }
    }
  }

  // --- Vínculos ---
  const rFuerza = regla(reglas, "fuerza_vinculo");
  const rEtapa = regla(reglas, "evento_con_etapa");
  const calificacionesVinculo = vinculos.map((v) => {
    const criterios: Criterio[] = [];
    if (rFuerza && v.fuerza) {
      criterios.push({
        criterio: "fuerza_vinculo",
        aporte: v.fuerza * rFuerza.peso,
        detalle: `Fuerza ${v.fuerza}/10`,
      });
    }
    if (rEtapa) {
      const [o, d] = [c(v.origen_id), c(v.destino_id)];
      const ev = eventos.find((e) => {
        if (!e.etapa) return false;
        const ps = new Set(e.participantes.map((p) => c(p.entidad_id)));
        return ps.has(o) && ps.has(d);
      });
      if (ev)
        criterios.push({
          criterio: "evento_con_etapa",
          aporte: rEtapa.peso,
          detalle: `Evento ${ev.tipo} en etapa ${ev.etapa}`,
        });
    }
    return cerrar("vinculo", v.id, criterios);
  });

  return [
    ...[...criteriosEntidad.entries()].map(([id, criterios]) => cerrar("entidad", id, criterios)),
    ...calificacionesVinculo,
  ];
}
