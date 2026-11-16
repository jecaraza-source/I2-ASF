import "server-only";
import { REGLAS_POR_DEFECTO, type DatosRed, type Nivel, type ReglaCalificacion } from "@sigma/red";
import { z } from "zod";
import { clienteServidor } from "@/lib/supabase/servidor";

type Cliente = Awaited<ReturnType<typeof clienteServidor>>;

const PAGINA = 1000;

/** Lee todas las filas de una consulta, en páginas (PostgREST limita a 1000 por respuesta). */
export async function leerTodo<T>(
  consulta: (
    desde: number,
    hasta: number,
  ) => PromiseLike<{ data: T[] | null; error: { code?: string } | null }>,
): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1);
    if (error) throw new Error(`Lectura de red fallida (${error.code ?? "?"})`);
    filas.push(...(data ?? []));
    if (!data || data.length < PAGINA) return filas;
  }
}

const listaDeTexto = z.array(z.string()).catch([]);

/** Datos del encargo que alimentan la red: solo registros validados (regla 4). */
export async function cargarDatosRed(supabase: Cliente, encargoId: string): Promise<DatosRed> {
  const [entidades, menciones, vinculos, eventos, alertas] = await Promise.all([
    leerTodo((d, h) =>
      supabase
        .from("entidad")
        .select(
          "id, tipo, nombre, nombre_normalizado, identificadores, atributos, riesgo_declarado, fusionada_en",
        )
        .eq("encargo_id", encargoId)
        .order("id")
        .range(d, h),
    ),
    leerTodo((d, h) =>
      supabase
        .from("registro_entidad")
        .select("registro_id, entidad_id, registro!inner(estado_validacion)")
        .eq("encargo_id", encargoId)
        .in("registro.estado_validacion", ["validado", "corregido"])
        .order("id")
        .range(d, h),
    ),
    leerTodo((d, h) =>
      supabase
        .from("vinculo")
        .select("id, origen_id, destino_id, tipo, fuerza")
        .eq("encargo_id", encargoId)
        .order("id")
        .range(d, h),
    ),
    leerTodo((d, h) =>
      supabase
        .from("evento")
        .select("id, tipo, atributos, evento_participante(entidad_id, rol)")
        .eq("encargo_id", encargoId)
        .order("id")
        .range(d, h),
    ),
    leerTodo((d, h) =>
      supabase
        .from("alerta")
        .select("id, regla, estado, detalle")
        .eq("encargo_id", encargoId)
        .eq("vigente", true)
        .order("id")
        .range(d, h),
    ),
  ]);

  return {
    entidades: entidades.map((e) => {
      const atributos = (e.atributos ?? {}) as Record<string, unknown>;
      return {
        id: e.id,
        tipo: e.tipo,
        nombre: e.nombre,
        nombre_normalizado: e.nombre_normalizado,
        identificadores: (e.identificadores ??
          {}) as DatosRed["entidades"][number]["identificadores"],
        tipos_declarados: listaDeTexto.parse(atributos.tipos_declarados),
        riesgo_declarado: e.riesgo_declarado,
        fusionada_en: e.fusionada_en,
      };
    }),
    menciones: menciones.map((m) => ({ registro_id: m.registro_id, entidad_id: m.entidad_id })),
    vinculos,
    eventos: eventos.map((e) => {
      const atributos = (e.atributos ?? {}) as Record<string, unknown>;
      const etapa =
        typeof atributos.etapa === "string" && atributos.etapa.trim() ? atributos.etapa : null;
      return {
        id: e.id,
        tipo: e.tipo,
        etapa,
        participantes: e.evento_participante.map((p) => ({ entidad_id: p.entidad_id, rol: p.rol })),
      };
    }),
    // Las reglas (tarea 06) guardan en detalle.entidades las entidades que señala cada alerta.
    alertas: alertas.map((a) => ({
      id: a.id,
      regla: a.regla,
      estado: a.estado,
      entidades: listaDeTexto.parse((a.detalle as Record<string, unknown> | null)?.entidades),
    })),
  };
}

/** Reglas activas (versión más reciente) o las provisionales de §9 como versión 0. */
export async function cargarReglas(
  supabase: Cliente,
  organizacionId: string,
): Promise<{ version: number; reglas: ReglaCalificacion[] }> {
  const { data } = await supabase
    .from("regla_calificacion")
    .select("version, criterio, peso, parametros")
    .eq("organizacion_id", organizacionId)
    .eq("activa", true)
    .order("version", { ascending: false });
  const filas = data ?? [];
  const version = filas[0]?.version;
  if (version === undefined) return { version: 0, reglas: REGLAS_POR_DEFECTO };
  return {
    version,
    reglas: filas
      .filter((f) => f.version === version)
      .map((f) => ({
        criterio: f.criterio,
        peso: Number(f.peso),
        parametros: (f.parametros ?? {}) as Record<string, unknown>,
      })),
  };
}

export type CalificacionGuardada = {
  id: string;
  objeto_tipo: string;
  objeto_id: string;
  puntaje: number;
  nivel: Nivel;
  ajuste_nivel: Nivel | null;
  ajuste_motivo: string | null;
  criterios: { criterio: string; aporte: number; detalle: string }[];
};

const criteriosSchema = z
  .array(z.object({ criterio: z.string(), aporte: z.number(), detalle: z.string() }))
  .catch([]);
const nivelSchema = z.enum(["critico", "alto", "medio", "bajo"]);

/** Una generación guardada: nodos, vínculos y calificaciones. */
export async function cargarGeneracion(supabase: Cliente, redId: string) {
  const [nodos, vinculos, calificaciones] = await Promise.all([
    leerTodo((d, h) =>
      supabase
        .from("red_nodo")
        .select("entidad_id, distancia")
        .eq("red_id", redId)
        .order("id")
        .range(d, h),
    ),
    leerTodo((d, h) =>
      supabase.from("red_vinculo").select("vinculo_id").eq("red_id", redId).order("id").range(d, h),
    ),
    leerTodo((d, h) =>
      supabase
        .from("calificacion")
        .select(
          "id, objeto_tipo, objeto_id, puntaje, nivel, ajuste_nivel, ajuste_motivo, criterios",
        )
        .eq("red_id", redId)
        .order("id")
        .range(d, h),
    ),
  ]);
  return {
    nodos,
    vinculos: vinculos.map((v) => v.vinculo_id),
    calificaciones: calificaciones.map((c): CalificacionGuardada => ({
      id: c.id,
      objeto_tipo: c.objeto_tipo,
      objeto_id: c.objeto_id,
      puntaje: Number(c.puntaje),
      nivel: nivelSchema.catch("bajo").parse(c.nivel),
      ajuste_nivel: c.ajuste_nivel ? nivelSchema.catch("bajo").parse(c.ajuste_nivel) : null,
      ajuste_motivo: c.ajuste_motivo,
      criterios: criteriosSchema.parse(c.criterios),
    })),
  };
}

/** Aplana las reglas al formulario de configuración (valores faltantes → §9). */
export function valoresDeReglas(reglas: ReglaCalificacion[]) {
  const de = (criterio: string) =>
    reglas.find((r) => r.criterio === criterio) ??
    REGLAS_POR_DEFECTO.find((r) => r.criterio === criterio);
  const num = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const niveles = z
    .record(z.string(), z.number())
    .catch({})
    .parse(de("riesgo_declarado")?.parametros.niveles);
  return {
    riesgo_critico: num(niveles.CRITICO, 60),
    riesgo_alto: num(niveles.ALTO, 40),
    riesgo_medio: num(niveles.MEDIO, 20),
    tipo_declarado: de("tipo_declarado")?.peso ?? 30,
    alertas_abiertas: de("alertas_abiertas")?.peso ?? 15,
    vinculo_fuerte_con_critico: de("vinculo_fuerte_con_critico")?.peso ?? 10,
    fuerza_minima: num(de("vinculo_fuerte_con_critico")?.parametros.fuerza_minima, 7),
    evento_con_etapa: de("evento_con_etapa")?.peso ?? 20,
    fuerza_vinculo: de("fuerza_vinculo")?.peso ?? 8,
    patron: z
      .string()
      .catch("FANTASMA|FACHADA|OFFSHORE")
      .parse(de("tipo_declarado")?.parametros.patron),
  };
}
