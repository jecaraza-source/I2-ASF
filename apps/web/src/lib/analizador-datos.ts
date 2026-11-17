import "server-only";
import { clienteServidor } from "@/lib/supabase/servidor";
import { enLotes } from "@/lib/vista-datos";

type Cliente = Awaited<ReturnType<typeof clienteServidor>>;

export const ESTADOS_VALIDADOS = ["validado", "corregido"] as const;
export const MAX_REGISTROS_ALCANCE = 300;

export const NOMBRE_ESTADO_SINTESIS: Record<string, string> = {
  generando: "Generándose",
  en_espera: "En espera",
  error: "Error",
  borrador: "Borrador",
  aprobada: "Aprobada",
  descartada: "Descartada",
};

export const MOTIVO_SINTESIS: Record<string, string> = {
  ia_apagada: "La IA está apagada para la organización.",
  no_permitido: "La IA no está permitida en este encargo (Configuración → IA en este encargo).",
  sin_llave: "Falta la llave del proveedor en el servidor.",
  sin_modelo: "Falta el modelo del proveedor en el servidor.",
  tope_diario: "Se alcanzó el tope diario de IA.",
  tope_mensual: "Se alcanzó el tope mensual de IA.",
  proveedor: "El proveedor de IA falló tres veces.",
  sin_afirmaciones: "La IA no devolvió ninguna afirmación con registros que la sostengan.",
};

export type RegistroAlcance = {
  id: string;
  resumen: string | null;
  tipo: string | null;
  fecha: string | null;
  expediente: string | null;
  origen: string;
};

/** Nombre legible del alcance (identificador del expediente o nombre de la entidad). */
export async function nombreAlcance(
  supabase: Cliente,
  encargoId: string,
  tipo: string,
  id: string,
): Promise<string | null> {
  if (tipo === "expediente") {
    const { data } = await supabase
      .from("expediente")
      .select("identificador")
      .eq("encargo_id", encargoId)
      .eq("id", id)
      .maybeSingle();
    return data?.identificador ?? null;
  }
  const { data } = await supabase
    .from("entidad")
    .select("nombre")
    .eq("encargo_id", encargoId)
    .eq("id", id)
    .maybeSingle();
  return data?.nombre ?? null;
}

async function detallesRegistros(supabase: Cliente, encargoId: string, ids: string[]) {
  const filas = await enLotes(ids, (lote) =>
    supabase
      .from("registro")
      .select(
        "id, resumen, origen, fecha_documento, estado_validacion, tipo_documento(nombre), expediente(identificador)",
      )
      .eq("encargo_id", encargoId)
      .in("id", lote),
  );
  return filas.map((r) => ({
    id: r.id,
    resumen: r.resumen,
    tipo: r.tipo_documento?.nombre ?? null,
    fecha: r.fecha_documento,
    expediente: r.expediente?.identificador ?? null,
    origen: r.origen,
    validado: (ESTADOS_VALIDADOS as readonly string[]).includes(r.estado_validacion),
  }));
}

/**
 * Registros VALIDADOS del alcance que el auditor puede elegir. Los demás ni aparecen. Para una
 * entidad se cuentan también las entidades fusionadas en ella.
 */
export async function registrosDelAlcance(
  supabase: Cliente,
  encargoId: string,
  tipo: "expediente" | "entidad",
  id: string,
): Promise<{ registros: RegistroAlcance[]; total: number; sinValidar: number }> {
  let ids: string[];
  if (tipo === "expediente") {
    const { data } = await supabase
      .from("registro")
      .select("id")
      .eq("encargo_id", encargoId)
      .eq("expediente_id", id)
      .limit(5000);
    ids = (data ?? []).map((r) => r.id);
  } else {
    const { data: entidades } = await supabase
      .from("entidad")
      .select("id")
      .eq("encargo_id", encargoId)
      .or(`id.eq.${id},fusionada_en.eq.${id}`);
    const { data } = await supabase
      .from("registro_entidad")
      .select("registro_id")
      .eq("encargo_id", encargoId)
      .in(
        "entidad_id",
        (entidades ?? []).map((e) => e.id),
      )
      .limit(5000);
    ids = [...new Set((data ?? []).map((r) => r.registro_id))];
  }
  const todos = await detallesRegistros(supabase, encargoId, ids);
  const validados = todos
    .filter((r) => r.validado)
    .sort(
      (a, b) => (a.fecha ?? "9999").localeCompare(b.fecha ?? "9999") || a.id.localeCompare(b.id),
    );
  return {
    registros: validados.slice(0, MAX_REGISTROS_ALCANCE),
    total: validados.length,
    sinValidar: todos.length - validados.length,
  };
}

export type AfirmacionVista = { orden: number; texto: string; registros: string[] };

export async function cargarSintesis(supabase: Cliente, encargoId: string, id: string) {
  const { data: s } = await supabase
    .from("sintesis")
    .select(
      "id, alcance_tipo, alcance_id, registros, estado, motivo, proveedor, modelo, generada_en, aprobada_por, aprobada_en, creado_en, creado_por",
    )
    .eq("encargo_id", encargoId)
    .eq("id", id)
    .maybeSingle();
  if (!s) return null;
  const [{ data: afirmaciones }, { data: adjuntos }, nombre] = await Promise.all([
    supabase
      .from("afirmacion")
      .select("version, orden, texto, registros")
      .eq("sintesis_id", s.id)
      .order("orden"),
    supabase
      .from("hallazgo_sintesis")
      .select("hallazgo(id, redaccion, firmado_en)")
      .eq("sintesis_id", s.id),
    nombreAlcance(supabase, encargoId, s.alcance_tipo, s.alcance_id),
  ]);
  const por = (v: string): AfirmacionVista[] =>
    (afirmaciones ?? [])
      .filter((a) => a.version === v)
      .map((a) => ({ orden: a.orden, texto: a.texto, registros: a.registros }));
  const citados = new Set<string>(s.registros);
  for (const a of afirmaciones ?? []) for (const r of a.registros) citados.add(r);
  const registros = await detallesRegistros(supabase, encargoId, [...citados]);
  return {
    ...s,
    nombre: nombre ?? "(sin nombre)",
    ia: por("ia"),
    borrador: por("borrador"),
    aprobada: por("aprobada"),
    registrosInfo: registros,
    hallazgos: (adjuntos ?? []).flatMap((h) => (h.hallazgo ? [h.hallazgo] : [])),
  };
}

export async function listarSintesis(supabase: Cliente, encargoId: string) {
  const { data } = await supabase
    .from("sintesis")
    .select("id, alcance_tipo, alcance_id, registros, estado, creado_en, aprobada_en")
    .eq("encargo_id", encargoId)
    .order("creado_en", { ascending: false })
    .limit(100);
  const filas = data ?? [];
  const exp = filas.filter((f) => f.alcance_tipo === "expediente").map((f) => f.alcance_id);
  const ent = filas.filter((f) => f.alcance_tipo === "entidad").map((f) => f.alcance_id);
  const [{ data: exps }, { data: ents }] = await Promise.all([
    exp.length
      ? supabase
          .from("expediente")
          .select("id, identificador")
          .in("id", [...new Set(exp)])
      : Promise.resolve({ data: [] as { id: string; identificador: string }[] }),
    ent.length
      ? supabase
          .from("entidad")
          .select("id, nombre")
          .in("id", [...new Set(ent)])
      : Promise.resolve({ data: [] as { id: string; nombre: string }[] }),
  ]);
  const nombres = new Map<string, string>([
    ...(exps ?? []).map((e) => [e.id, e.identificador] as [string, string]),
    ...(ents ?? []).map((e) => [e.id, e.nombre] as [string, string]),
  ]);
  return filas.map((f) => ({ ...f, nombre: nombres.get(f.alcance_id) ?? "(sin nombre)" }));
}

export async function listarHallazgos(supabase: Cliente, encargoId: string) {
  const { data } = await supabase
    .from("hallazgo")
    .select(
      "id, redaccion, firmado_en, creado_en, hallazgo_sintesis(sintesis_id), hallazgo_alerta(alerta_id)",
    )
    .eq("encargo_id", encargoId)
    .order("creado_en", { ascending: false })
    .limit(200);
  return data ?? [];
}

export async function cargarHallazgo(supabase: Cliente, encargoId: string, id: string) {
  const { data } = await supabase
    .from("hallazgo")
    .select(
      "id, redaccion, firmado_en, firmado_por, creado_en, hallazgo_sintesis(sintesis(id, alcance_tipo, alcance_id, estado, aprobada_en)), hallazgo_alerta(alerta(id, regla, severidad, estado, detalle))",
    )
    .eq("encargo_id", encargoId)
    .eq("id", id)
    .maybeSingle();
  if (!data) return null;
  const sintesis = await Promise.all(
    data.hallazgo_sintesis.flatMap((h) =>
      h.sintesis
        ? [
            nombreAlcance(supabase, encargoId, h.sintesis.alcance_tipo, h.sintesis.alcance_id).then(
              (nombre) => ({ ...h.sintesis!, nombre: nombre ?? "(sin nombre)" }),
            ),
          ]
        : [],
    ),
  );
  return { ...data, sintesis };
}

/** Síntesis aprobadas del encargo, para adjuntarlas a un hallazgo. */
export async function sintesisAprobadas(supabase: Cliente, encargoId: string) {
  const filas = (await listarSintesis(supabase, encargoId)).filter((s) => s.estado === "aprobada");
  return filas;
}
