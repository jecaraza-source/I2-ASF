import "server-only";
import { agruparEventos, type AristaVista, type GrafoVista, type Nivel } from "@sigma/red";
import { z } from "zod";
import { cargarGeneracion, type CalificacionGuardada } from "@/lib/red-datos";
import { clienteServidor } from "@/lib/supabase/servidor";

type Cliente = Awaited<ReturnType<typeof clienteServidor>>;

const PAGINA = 1000;
const LOTE = 150;

async function leerTodo<T>(
  consulta: (
    desde: number,
    hasta: number,
  ) => PromiseLike<{ data: T[] | null; error: { code?: string } | null }>,
): Promise<T[]> {
  const filas: T[] = [];
  for (let desde = 0; ; desde += PAGINA) {
    const { data, error } = await consulta(desde, desde + PAGINA - 1);
    if (error) throw new Error(`Lectura fallida (${error.code ?? "?"})`);
    filas.push(...(data ?? []));
    if (!data || data.length < PAGINA) return filas;
  }
}

/** Lotes que se piden a la vez: con 5,000 entidades son 34 lotes, y en serie tardaban segundos. */
const LOTES_EN_PARALELO = 6;

/** Consulta `.in()` en lotes para no exceder el largo de la URL; varios lotes a la vez. */
export async function enLotes<T>(
  ids: string[],
  consulta: (lote: string[]) => PromiseLike<{ data: T[] | null; error: { code?: string } | null }>,
  tamano = LOTE,
): Promise<T[]> {
  const lotes: string[][] = [];
  for (let i = 0; i < ids.length; i += tamano) lotes.push(ids.slice(i, i + tamano));
  const resultados: T[][] = new Array<T[]>(lotes.length);
  let siguiente = 0;
  const trabajador = async () => {
    for (let i = siguiente++; i < lotes.length; i = siguiente++) {
      const { data, error } = await consulta(lotes[i] ?? []);
      if (error) throw new Error(`Lectura fallida (${error.code ?? "?"})`);
      resultados[i] = data ?? [];
    }
  };
  await Promise.all(Array.from({ length: Math.min(LOTES_EN_PARALELO, lotes.length) }, trabajador));
  return resultados.flat();
}

const fechaMexico = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Mexico_City",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Día (aaaa-mm-dd) en la zona de México de un timestamptz. */
const valorOriginalSchema = z
  .object({ valor_crudo: z.string().nullable().optional() })
  .nullable()
  .transform((v) => v ?? {})
  .catch({});

export function diaMexico(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : fechaMexico.format(d);
}

const ubicacionSchema = z
  .object({
    hoja: z.string().optional(),
    fila: z.number().optional(),
    celda: z.string().optional(),
    pagina: z.number().optional(),
  })
  .catch({});

/** «Hoja Contratos, fila 7, celda C7» o «Página 3». */
export function describirUbicacion(u: unknown): string {
  const x = ubicacionSchema.parse(u);
  const partes = [
    x.pagina !== undefined ? `Página ${x.pagina}` : null,
    x.hoja ? `Hoja ${x.hoja}` : null,
    x.fila !== undefined ? `fila ${x.fila}` : null,
    x.celda ? `celda ${x.celda}` : null,
  ].filter(Boolean);
  return partes.length ? partes.join(", ") : "Sin ubicación";
}

const NIVEL = z.enum(["critico", "alto", "medio", "bajo"]);

/** Generación más reciente del encargo (o null si no hay). */
export async function ultimaGeneracion(supabase: Cliente, encargoId: string) {
  const { data } = await supabase
    .from("red_generada")
    .select("id, generada_en, version_reglas")
    .eq("encargo_id", encargoId)
    .order("generada_en", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/** Grafo dibujable de una generación: nodos calificados, vínculos y eventos agrupados por par. */
export async function cargarVista(
  supabase: Cliente,
  encargoId: string,
  redId: string,
): Promise<GrafoVista> {
  const gen = await cargarGeneracion(supabase, redId);
  const ids = gen.nodos.map((n) => n.entidad_id);
  const [entidades, vinculos, eventos] = await Promise.all([
    enLotes(ids, (lote) =>
      supabase
        .from("entidad")
        .select("id, nombre, tipo")
        .eq("encargo_id", encargoId)
        .in("id", lote),
    ),
    enLotes(gen.vinculos, (lote) =>
      supabase
        .from("vinculo")
        .select(
          "id, origen_id, destino_id, tipo, fuerza, fecha_inicio, monto, moneda, participacion",
        )
        .eq("encargo_id", encargoId)
        .in("id", lote),
    ),
    leerTodo((d, h) =>
      supabase
        .from("evento")
        .select("id, tipo, fecha_hora, evento_participante(entidad_id, rol)")
        .eq("encargo_id", encargoId)
        .order("id")
        .range(d, h),
    ),
  ]);

  const cal = new Map(
    gen.calificaciones.filter((c) => c.objeto_tipo === "entidad").map((c) => [c.objeto_id, c]),
  );
  const nodos = entidades.map((e) => {
    const c = cal.get(e.id);
    const nivel: Nivel = c ? (c.ajuste_nivel ?? c.nivel) : "bajo";
    return { id: e.id, nombre: e.nombre, tipo: e.tipo, nivel, puntaje: c?.puntaje ?? 0 };
  });
  const tipoDe = new Map(nodos.map((n) => [n.id, n.tipo]));
  const aristasVinculo: AristaVista[] = vinculos
    .filter((v) => tipoDe.has(v.origen_id) && tipoDe.has(v.destino_id))
    .map((v) => ({
      id: `v:${v.id}`,
      clase: "vinculo",
      tipo: v.tipo,
      origen: v.origen_id,
      destino: v.destino_id,
      fuerza: v.fuerza ?? 3,
      cantidad: 1,
      desde: v.fecha_inicio,
      hasta: v.fecha_inicio,
      objetos: [v.id],
      monto: v.monto === null ? null : String(v.monto),
      moneda: v.moneda,
      participacion: v.participacion === null ? null : Number(v.participacion),
    }));
  const aristasEvento = agruparEventos(
    eventos.map((e) => ({
      id: e.id,
      tipo: e.tipo,
      fecha: diaMexico(e.fecha_hora),
      participantes: e.evento_participante.map((p) => ({ entidad_id: p.entidad_id, rol: p.rol })),
    })),
    tipoDe,
  );
  return {
    nodos: nodos.sort((a, b) => a.nombre.localeCompare(b.nombre)),
    aristas: [...aristasVinculo, ...aristasEvento],
  };
}

export type Origen = {
  registro_id: string;
  resumen: string | null;
  fuente: string | null;
  fecha_documento: string | null;
  documento: { id: string; nombre: string } | null;
  /** Ubicación del registro en su fuente (hoja y fila, o página). */
  ubicacion: string | null;
  ubicaciones: { extraccion_id: string | null; campo: string | null; texto: string }[];
};

type FilaEvidencia = {
  objeto_id: string;
  registro_id: string;
  extraccion_id: string | null;
};

/** Agrupa evidencias por objeto, con registro, documento y celdas de origen. */
async function origenesDe(
  supabase: Cliente,
  encargoId: string,
  evidencias: FilaEvidencia[],
  registrosExtra: string[] = [],
): Promise<{ porObjeto: Map<string, Origen[]>; registros: Map<string, Origen> }> {
  const regIds = [...new Set([...evidencias.map((e) => e.registro_id), ...registrosExtra])];
  const extIds = [
    ...new Set(evidencias.map((e) => e.extraccion_id).filter((x): x is string => !!x)),
  ];
  const [registros, extracciones, celdas] = await Promise.all([
    enLotes(regIds, (lote) =>
      supabase
        .from("registro")
        .select(
          "id, resumen, fuente, fecha_documento, documento_id, documento_origen(id, nombre_archivo)",
        )
        .eq("encargo_id", encargoId)
        .in("id", lote),
    ),
    enLotes(extIds, (lote) =>
      supabase
        .from("extraccion")
        .select("id, campo, ubicacion")
        .eq("encargo_id", encargoId)
        .in("id", lote),
    ),
    // Una fila de Excel = un registro: basta la primera celda para saber hoja y fila.
    enLotes(
      regIds,
      (lote) =>
        supabase
          .from("extraccion")
          .select("registro_id, ubicacion")
          .eq("encargo_id", encargoId)
          .in("registro_id", lote)
          .order("creado_en")
          .limit(1000),
      40,
    ),
  ]);
  const ubicacionRegistro = new Map<string, string>();
  for (const c of celdas) {
    if (ubicacionRegistro.has(c.registro_id)) continue;
    const u = ubicacionSchema.parse(c.ubicacion);
    const texto = describirUbicacion({ hoja: u.hoja, fila: u.fila, pagina: u.pagina });
    if (texto !== "Sin ubicación") ubicacionRegistro.set(c.registro_id, texto);
  }
  const ext = new Map(extracciones.map((x) => [x.id, x]));
  const base = new Map<string, Origen>(
    registros.map((r) => [
      r.id,
      {
        registro_id: r.id,
        resumen: r.resumen,
        fuente: r.fuente,
        fecha_documento: r.fecha_documento,
        documento: r.documento_origen
          ? { id: r.documento_origen.id, nombre: r.documento_origen.nombre_archivo }
          : null,
        ubicacion: ubicacionRegistro.get(r.id) ?? null,
        ubicaciones: [],
      },
    ]),
  );
  const porObjeto = new Map<string, Origen[]>();
  for (const ev of evidencias) {
    const r = base.get(ev.registro_id);
    if (!r) continue;
    const lista = porObjeto.get(ev.objeto_id) ?? [];
    let o = lista.find((x) => x.registro_id === r.registro_id);
    if (!o) {
      o = { ...r, ubicaciones: [] };
      lista.push(o);
      porObjeto.set(ev.objeto_id, lista);
    }
    const x = ev.extraccion_id ? ext.get(ev.extraccion_id) : undefined;
    if (x)
      o.ubicaciones.push({
        extraccion_id: x.id,
        campo: x.campo,
        texto: describirUbicacion(x.ubicacion),
      });
  }
  return { porObjeto, registros: base };
}

async function evidenciasDe(
  supabase: Cliente,
  encargoId: string,
  objetoTipo: "entidad" | "vinculo" | "evento",
  ids: string[],
): Promise<FilaEvidencia[]> {
  return enLotes(ids, (lote) =>
    supabase
      .from("evidencia")
      .select("objeto_id, registro_id, extraccion_id")
      .eq("encargo_id", encargoId)
      .eq("objeto_tipo", objetoTipo)
      .in("objeto_id", lote),
  );
}

export type Ficha = {
  entidad: {
    id: string;
    nombre: string;
    tipo: string;
    riesgo_declarado: string | null;
    identificadores: [string, string][];
    atributos: [string, string][];
    alias: string[];
    fusionada_en: { id: string; nombre: string } | null;
  };
  registros: Origen[];
  vinculos: {
    id: string;
    tipo: string;
    fuerza: number | null;
    fecha_inicio: string | null;
    monto: string | null;
    moneda: string | null;
    participacion: number | null;
    sentido: "sale" | "entra";
    otra: { id: string; nombre: string };
    origenes: Origen[];
  }[];
  eventos: {
    id: string;
    tipo: string;
    fecha: string | null;
    monto: string | null;
    moneda: string | null;
    rol: string;
    contrapartes: { id: string; nombre: string }[];
    origenes: Origen[];
  }[];
  eventos_total: number;
  calificacion: CalificacionGuardada | null;
  generacion: { id: string; generada_en: string } | null;
};

const MAX_EVENTOS = 100;

function aTexto(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (Array.isArray(v)) return v.map(aTexto).join(", ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Ficha de una entidad del encargo; null si no existe o RLS la oculta. */
export async function cargarFicha(
  supabase: Cliente,
  encargoId: string,
  entidadId: string,
): Promise<Ficha | null> {
  if (!z.uuid().safeParse(entidadId).success) return null;
  const { data: e } = await supabase
    .from("entidad")
    .select("id, nombre, tipo, riesgo_declarado, identificadores, atributos, fusionada_en")
    .eq("encargo_id", encargoId)
    .eq("id", entidadId)
    .maybeSingle();
  if (!e) return null;

  const [alias, menciones, vinculos, participaciones, evEntidad, generacion, absorbente] =
    await Promise.all([
      supabase.from("alias_entidad").select("alias").eq("entidad_id", e.id).order("alias"),
      supabase
        .from("registro_entidad")
        .select("registro_id")
        .eq("encargo_id", encargoId)
        .eq("entidad_id", e.id)
        .limit(500),
      supabase
        .from("vinculo")
        .select(
          "id, origen_id, destino_id, tipo, fuerza, fecha_inicio, monto, moneda, participacion",
        )
        .eq("encargo_id", encargoId)
        .or(`origen_id.eq.${e.id},destino_id.eq.${e.id}`)
        .limit(500),
      supabase
        .from("evento_participante")
        .select("rol, evento!inner(id, tipo, fecha_hora, monto, moneda)", { count: "exact" })
        .eq("encargo_id", encargoId)
        .eq("entidad_id", e.id)
        .order("fecha_hora", { referencedTable: "evento", ascending: true })
        .limit(MAX_EVENTOS),
      evidenciasDe(supabase, encargoId, "entidad", [e.id]),
      ultimaGeneracion(supabase, encargoId),
      e.fusionada_en
        ? supabase.from("entidad").select("id, nombre").eq("id", e.fusionada_en).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

  const eventos = participaciones.data ?? [];
  const eventoIds = eventos.map((p) => p.evento.id);
  const [contrapartes, evVinculos, evEventos, calificacion] = await Promise.all([
    enLotes(eventoIds, (lote) =>
      supabase
        .from("evento_participante")
        .select("evento_id, entidad_id")
        .eq("encargo_id", encargoId)
        .in("evento_id", lote)
        .neq("entidad_id", e.id),
    ),
    evidenciasDe(
      supabase,
      encargoId,
      "vinculo",
      (vinculos.data ?? []).map((v) => v.id),
    ),
    evidenciasDe(supabase, encargoId, "evento", eventoIds),
    generacion
      ? supabase
          .from("calificacion")
          .select(
            "id, objeto_tipo, objeto_id, puntaje, nivel, ajuste_nivel, ajuste_motivo, criterios",
          )
          .eq("red_id", generacion.id)
          .eq("objeto_tipo", "entidad")
          .eq("objeto_id", e.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const otrosIds = [
    ...new Set([
      ...(vinculos.data ?? []).map((v) => (v.origen_id === e.id ? v.destino_id : v.origen_id)),
      ...contrapartes.map((c) => c.entidad_id),
    ]),
  ];
  const otros = await enLotes(otrosIds, (lote) =>
    supabase.from("entidad").select("id, nombre").eq("encargo_id", encargoId).in("id", lote),
  );
  const nombre = new Map(otros.map((o) => [o.id, o.nombre]));
  const origenes = await origenesDe(
    supabase,
    encargoId,
    [...evEntidad, ...evVinculos, ...evEventos],
    (menciones.data ?? []).map((m) => m.registro_id),
  );

  const registrosEntidad = new Map<string, Origen>();
  for (const id of (menciones.data ?? []).map((m) => m.registro_id)) {
    const r = origenes.registros.get(id);
    if (r) registrosEntidad.set(id, { ...r, ubicaciones: [] });
  }
  for (const o of origenes.porObjeto.get(e.id) ?? []) registrosEntidad.set(o.registro_id, o);

  const c = calificacion.data;
  const criterios = z
    .array(z.object({ criterio: z.string(), aporte: z.number(), detalle: z.string() }))
    .catch([]);

  return {
    entidad: {
      id: e.id,
      nombre: e.nombre,
      tipo: e.tipo,
      riesgo_declarado: e.riesgo_declarado,
      identificadores: Object.entries((e.identificadores ?? {}) as Record<string, unknown>)
        .filter(([k]) => k !== "invalidos")
        .map(([k, v]) => [k, aTexto(v)]),
      atributos: Object.entries((e.atributos ?? {}) as Record<string, unknown>).map(([k, v]) => [
        k,
        aTexto(v),
      ]),
      alias: (alias.data ?? []).map((a) => a.alias),
      fusionada_en: absorbente.data ?? null,
    },
    registros: [...registrosEntidad.values()].sort((a, b) =>
      (a.resumen ?? "").localeCompare(b.resumen ?? ""),
    ),
    vinculos: (vinculos.data ?? []).map((v) => {
      const sale = v.origen_id === e.id;
      const otra = sale ? v.destino_id : v.origen_id;
      return {
        id: v.id,
        tipo: v.tipo,
        fuerza: v.fuerza,
        fecha_inicio: v.fecha_inicio,
        monto: v.monto === null ? null : String(v.monto),
        moneda: v.moneda,
        participacion: v.participacion === null ? null : Number(v.participacion),
        sentido: sale ? "sale" : "entra",
        otra: { id: otra, nombre: nombre.get(otra) ?? "?" },
        origenes: origenes.porObjeto.get(v.id) ?? [],
      };
    }),
    eventos: eventos.map((p) => ({
      id: p.evento.id,
      tipo: p.evento.tipo,
      fecha: diaMexico(p.evento.fecha_hora),
      monto: p.evento.monto === null ? null : String(p.evento.monto),
      moneda: p.evento.moneda,
      rol: p.rol,
      contrapartes: [
        ...new Set(
          contrapartes.filter((x) => x.evento_id === p.evento.id).map((x) => x.entidad_id),
        ),
      ].map((id) => ({ id, nombre: nombre.get(id) ?? "?" })),
      origenes: origenes.porObjeto.get(p.evento.id) ?? [],
    })),
    eventos_total: participaciones.count ?? eventos.length,
    calificacion: c
      ? {
          id: c.id,
          objeto_tipo: c.objeto_tipo,
          objeto_id: c.objeto_id,
          puntaje: Number(c.puntaje),
          nivel: NIVEL.catch("bajo").parse(c.nivel),
          ajuste_nivel: c.ajuste_nivel ? NIVEL.catch("bajo").parse(c.ajuste_nivel) : null,
          ajuste_motivo: c.ajuste_motivo,
          criterios: criterios.parse(c.criterios),
        }
      : null,
    generacion: generacion ? { id: generacion.id, generada_en: generacion.generada_en } : null,
  };
}

export type EvidenciaArista = {
  objetos: {
    id: string;
    descripcion: string;
    fecha: string | null;
    origenes: Origen[];
  }[];
  total: number;
};

const MAX_EVIDENCIA = 200;

/** Evidencia de una arista: los vínculos o eventos que la sostienen y sus registros de origen. */
export async function cargarEvidencia(
  supabase: Cliente,
  encargoId: string,
  clase: "vinculo" | "evento",
  ids: string[],
): Promise<EvidenciaArista> {
  const lista = ids.slice(0, MAX_EVIDENCIA);
  if (clase === "vinculo") {
    const filas = await enLotes(lista, (lote) =>
      supabase
        .from("vinculo")
        .select("id, tipo, fuerza, fuerza_original, fecha_inicio")
        .eq("encargo_id", encargoId)
        .in("id", lote),
    );
    const o = await origenesDe(
      supabase,
      encargoId,
      await evidenciasDe(supabase, encargoId, "vinculo", lista),
    );
    return {
      total: ids.length,
      objetos: filas.map((v) => ({
        id: v.id,
        descripcion: `${v.tipo}${v.fuerza !== null ? ` · fuerza ${v.fuerza}` : ""}${v.fuerza_original ? ` (declarada «${v.fuerza_original}»)` : ""}`,
        fecha: v.fecha_inicio,
        origenes: o.porObjeto.get(v.id) ?? [],
      })),
    };
  }
  const filas = await enLotes(lista, (lote) =>
    supabase
      .from("evento")
      .select("id, tipo, fecha_hora, monto, moneda, atributos")
      .eq("encargo_id", encargoId)
      .in("id", lote),
  );
  const o = await origenesDe(
    supabase,
    encargoId,
    await evidenciasDe(supabase, encargoId, "evento", lista),
  );
  return {
    total: ids.length,
    objetos: filas
      .sort((a, b) => (a.fecha_hora ?? "").localeCompare(b.fecha_hora ?? ""))
      .map((ev) => {
        const atributos = (ev.atributos ?? {}) as Record<string, unknown>;
        const detalle = typeof atributos.tipo === "string" ? atributos.tipo : ev.tipo;
        return {
          id: ev.id,
          descripcion: `${detalle}${ev.monto !== null ? ` · ${ev.monto} ${ev.moneda ?? ""}`.trimEnd() : ""}`,
          fecha: diaMexico(ev.fecha_hora),
          origenes: o.porObjeto.get(ev.id) ?? [],
        };
      }),
  };
}

/** Registro con sus extracciones (celdas o páginas de origen) y entidades mencionadas. */
export async function cargarRegistro(supabase: Cliente, encargoId: string, registroId: string) {
  if (!z.uuid().safeParse(registroId).success) return null;
  const { data: r } = await supabase
    .from("registro")
    .select(
      "id, origen, fuente, fecha_documento, estado_validacion, resumen, creado_en, documento_id, documento_origen(id, nombre_archivo), expediente_id, expediente(identificador)",
    )
    .eq("encargo_id", encargoId)
    .eq("id", registroId)
    .maybeSingle();
  if (!r) return null;
  const [extracciones, menciones] = await Promise.all([
    leerTodo((d, h) =>
      supabase
        .from("extraccion")
        .select(
          "id, campo, valor_crudo, valor_normalizado, confianza, ubicacion, metodo, estado, valor_original",
        )
        .eq("encargo_id", encargoId)
        .eq("registro_id", r.id)
        .order("creado_en")
        .order("id")
        .range(d, h),
    ),
    supabase
      .from("registro_entidad")
      .select("rol, entidad(id, nombre, tipo, nombre_normalizado)")
      .eq("encargo_id", encargoId)
      .eq("registro_id", r.id),
  ]);
  // Aportación y acciones de cada socio: salen de la lectura validada del involucrado.
  const aportaciones = new Map<string, { monto: string; moneda: string }>();
  const acciones = new Map<string, string>();
  for (const x of extracciones) {
    if (!/^involucrado_\d+$/.test(x.campo) || !["validado", "corregido"].includes(x.estado))
      continue;
    const v = aportacionSchema.safeParse(x.valor_normalizado);
    if (v.success && v.data.aportacion) {
      aportaciones.set(`${v.data.nombre}|${v.data.rol}`, v.data.aportacion);
    }
    if (v.success && v.data.acciones)
      acciones.set(`${v.data.nombre}|${v.data.rol}`, v.data.acciones);
  }
  return {
    registro: r,
    extracciones: extracciones.map((x) => ({
      ...x,
      // En una corrección, lo que había leído la IA.
      valor_ia: valorOriginalSchema.parse(x.valor_original).valor_crudo ?? null,
      ubicacion_texto: describirUbicacion(x.ubicacion),
    })),
    entidades: (menciones.data ?? []).map((m) => ({
      rol: m.rol,
      ...m.entidad,
      aportacion: m.entidad
        ? (aportaciones.get(`${m.entidad.nombre_normalizado}|${m.rol}`) ?? null)
        : null,
      acciones: m.entidad
        ? (acciones.get(`${m.entidad.nombre_normalizado}|${m.rol}`) ?? null)
        : null,
    })),
  };
}

const aportacionSchema = z
  .object({
    nombre: z.string(),
    rol: z.string(),
    aportacion: z.object({ monto: z.string(), moneda: z.string() }).optional(),
    acciones: z.string().optional(),
  })
  .catch({ nombre: "", rol: "" });

/** Lo que un registro generó (vínculos y eventos, por su evidencia) y su bitácora. */
export async function cargarGenerado(supabase: Cliente, encargoId: string, registroId: string) {
  const [{ data: evidencias }, bitacora] = await Promise.all([
    supabase
      .from("evidencia")
      .select("objeto_tipo, objeto_id")
      .eq("encargo_id", encargoId)
      .eq("registro_id", registroId)
      .in("objeto_tipo", ["vinculo", "evento"])
      .limit(500),
    supabase.rpc("bitacora_registro", { p_registro: registroId }),
  ]);
  const ids = (tipo: string) => [
    ...new Set((evidencias ?? []).filter((e) => e.objeto_tipo === tipo).map((e) => e.objeto_id)),
  ];
  const [vinculos, eventos] = await Promise.all([
    ids("vinculo").length
      ? supabase
          .from("vinculo")
          .select("id, tipo, fuerza, origen_id, destino_id, dirigido")
          .eq("encargo_id", encargoId)
          .in("id", ids("vinculo"))
      : Promise.resolve({ data: [] }),
    ids("evento").length
      ? supabase
          .from("evento")
          .select(
            "id, tipo, fecha_hora, monto, moneda, evento_participante(rol, entidad(id, nombre))",
          )
          .eq("encargo_id", encargoId)
          .in("id", ids("evento"))
          .order("fecha_hora")
      : Promise.resolve({ data: [] }),
  ]);
  const extremos = [...new Set((vinculos.data ?? []).flatMap((v) => [v.origen_id, v.destino_id]))];
  const { data: nombres } = extremos.length
    ? await supabase.from("entidad").select("id, nombre").in("id", extremos)
    : { data: [] };
  const nombre = new Map((nombres ?? []).map((e) => [e.id, e.nombre]));
  if (bitacora.error) {
    console.error(`[cargarGenerado] bitácora: ${bitacora.error.code ?? "desconocido"}`);
  }
  return {
    vinculos: (vinculos.data ?? []).map((v) => ({
      ...v,
      origen: nombre.get(v.origen_id) ?? "Entidad",
      destino: nombre.get(v.destino_id) ?? "Entidad",
    })),
    eventos: (eventos.data ?? []).map((ev) => ({
      id: ev.id,
      tipo: ev.tipo,
      fecha: diaMexico(ev.fecha_hora),
      monto: ev.monto,
      moneda: ev.moneda,
      participantes: (ev.evento_participante ?? []).flatMap((p) =>
        p.entidad ? [{ rol: p.rol, id: p.entidad.id, nombre: p.entidad.nombre }] : [],
      ),
    })),
    bitacora: bitacora.data ?? [],
  };
}
