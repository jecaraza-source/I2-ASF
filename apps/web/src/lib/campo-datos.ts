import "server-only";
import { PREGUNTAS_CAMPO } from "@sigma/reglas";
import { z } from "zod";
import { leerTodo } from "@/lib/red-datos";
import type { clienteServidor } from "@/lib/supabase/servidor";

type Cliente = Awaited<ReturnType<typeof clienteServidor>>;

const NIVELES_A_VISITAR = new Set(["critico", "alto"]);
const TIPOS_A_VISITAR = new Set(["persona_moral", "persona_fisica"]);
const VIGENCIA_FOTO = 60 * 10;

export type PropuestaVisita = {
  entidad_id: string;
  nombre: string;
  tipo: string;
  rfc: string | null;
  nivel: string;
  puntaje: number;
};

/**
 * Programa de trabajo sugerido: proveedores crítico o alto en la red más reciente que no tienen
 * una visita abierta. El auditor decide cuáles se visitan.
 */
export async function proponerVisitas(
  supabase: Cliente,
  encargoId: string,
): Promise<{ red: { id: string; generada_en: string } | null; propuestas: PropuestaVisita[] }> {
  const { data: red } = await supabase
    .from("red_generada")
    .select("id, generada_en")
    .eq("encargo_id", encargoId)
    .order("generada_en", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!red) return { red: null, propuestas: [] };

  const [calificaciones, abiertas] = await Promise.all([
    leerTodo((d, h) =>
      supabase
        .from("calificacion")
        .select("objeto_id, puntaje, nivel, ajuste_nivel")
        .eq("red_id", red.id)
        .eq("objeto_tipo", "entidad")
        .order("id")
        .range(d, h),
    ),
    leerTodo((d, h) =>
      supabase
        .from("visita_campo")
        .select("entidad_id")
        .eq("encargo_id", encargoId)
        .eq("estado", "asignada")
        .order("id")
        .range(d, h),
    ),
  ]);
  const conVisita = new Set(abiertas.map((v) => v.entidad_id));
  const candidatas = calificaciones
    .map((c) => ({ ...c, efectivo: c.ajuste_nivel ?? c.nivel }))
    .filter((c) => NIVELES_A_VISITAR.has(c.efectivo) && !conVisita.has(c.objeto_id));
  if (candidatas.length === 0) return { red, propuestas: [] };

  const entidades = new Map<
    string,
    { nombre: string; tipo: string; identificadores: unknown; fusionada_en: string | null }
  >();
  for (let i = 0; i < candidatas.length; i += 200) {
    const ids = candidatas.slice(i, i + 200).map((c) => c.objeto_id);
    const { data } = await supabase
      .from("entidad")
      .select("id, nombre, tipo, identificadores, fusionada_en")
      .in("id", ids);
    for (const e of data ?? []) entidades.set(e.id, e);
  }
  const rfcDe = z.object({ rfc: z.string() }).partial().catch({});
  const propuestas = candidatas.flatMap((c): PropuestaVisita[] => {
    const e = entidades.get(c.objeto_id);
    if (!e || e.fusionada_en || !TIPOS_A_VISITAR.has(e.tipo)) return [];
    return [
      {
        entidad_id: c.objeto_id,
        nombre: e.nombre,
        tipo: e.tipo,
        rfc: rfcDe.parse(e.identificadores).rfc ?? null,
        nivel: c.efectivo,
        puntaje: Number(c.puntaje),
      },
    ];
  });
  propuestas.sort((a, b) => b.puntaje - a.puntaje || a.nombre.localeCompare(b.nombre, "es"));
  return { red, propuestas };
}

export type Verificador = { usuario_id: string; correo: string; rol: string };

export async function listarVerificadores(
  supabase: Cliente,
  organizacionId: string,
): Promise<Verificador[]> {
  const { data } = await supabase.rpc("verificadores_organizacion", {
    p_organizacion: organizacionId,
  });
  return data ?? [];
}

const respuestasSchema = z.record(z.string(), z.enum(["si", "no", "no_verificable"])).catch({});

export type VisitaListada = {
  id: string;
  entidad_id: string;
  entidad: string;
  estado: string;
  nivel: string | null;
  verificador: string;
  creado_en: string;
  instrucciones: string | null;
  motivo: string | null;
  domicilios: string[];
  cedula: {
    registro_id: string;
    capturada_en: string;
    recibida_en: string;
    respuestas: { clave: string; pregunta: string; respuesta: string }[];
    domicilio_observado: string | null;
    observaciones: string | null;
    ubicacion: { latitud: number; longitud: number; precision_m: number | null } | null;
  } | null;
  fotos: {
    id: string;
    url: string | null;
    sha256: string;
    capturada_en: string;
    ubicacion: boolean;
  }[];
};

/** Visitas del encargo con su cédula y sus fotos (URL firmada de corta vigencia). */
export async function listarVisitas(
  supabase: Cliente,
  encargoId: string,
  verificadores: Verificador[],
): Promise<VisitaListada[]> {
  const { data } = await supabase
    .from("visita_campo")
    .select(
      "id, entidad_id, estado, nivel, verificador_id, creado_en, instrucciones, motivo, domicilios, " +
        "entidad(nombre), " +
        "cedula_campo(registro_id, capturada_en, recibida_en, respuestas, domicilio_observado, observaciones, latitud, longitud, precision_m), " +
        "evidencia_campo(id, ruta, sha256, capturada_en, latitud)",
    )
    .eq("encargo_id", encargoId)
    .order("creado_en", { ascending: false })
    .limit(300)
    .overrideTypes<
      {
        id: string;
        entidad_id: string;
        estado: string;
        nivel: string | null;
        verificador_id: string;
        creado_en: string;
        instrucciones: string | null;
        motivo: string | null;
        domicilios: string[];
        entidad: { nombre: string } | null;
        cedula_campo: {
          registro_id: string;
          capturada_en: string;
          recibida_en: string;
          respuestas: unknown;
          domicilio_observado: string | null;
          observaciones: string | null;
          latitud: number | null;
          longitud: number | null;
          precision_m: number | null;
        } | null;
        evidencia_campo: {
          id: string;
          ruta: string;
          sha256: string;
          capturada_en: string;
          latitud: number | null;
        }[];
      }[],
      { merge: false }
    >();
  const filas = data ?? [];
  const rutas = filas.flatMap((v) => v.evidencia_campo.map((f) => f.ruta));
  const urls = new Map<string, string>();
  if (rutas.length > 0) {
    const { data: firmadas } = await supabase.storage
      .from("campo")
      .createSignedUrls(rutas, VIGENCIA_FOTO);
    for (const f of firmadas ?? []) if (f.path && f.signedUrl) urls.set(f.path, f.signedUrl);
  }
  const correo = new Map(verificadores.map((v) => [v.usuario_id, v.correo]));

  return filas.map((v) => {
    const c = v.cedula_campo;
    const resp = c ? respuestasSchema.parse(c.respuestas) : {};
    return {
      id: v.id,
      entidad_id: v.entidad_id,
      entidad: v.entidad?.nombre ?? "—",
      estado: v.estado,
      nivel: v.nivel,
      verificador: correo.get(v.verificador_id) ?? "Usuario inactivo",
      creado_en: v.creado_en,
      instrucciones: v.instrucciones,
      motivo: v.motivo,
      domicilios: v.domicilios,
      cedula: c
        ? {
            registro_id: c.registro_id,
            capturada_en: c.capturada_en,
            recibida_en: c.recibida_en,
            respuestas: PREGUNTAS_CAMPO.map((p) => ({
              clave: p.clave,
              pregunta: p.pregunta,
              respuesta: resp[p.clave] ?? "—",
            })),
            domicilio_observado: c.domicilio_observado,
            observaciones: c.observaciones,
            ubicacion:
              c.latitud !== null && c.longitud !== null
                ? {
                    latitud: Number(c.latitud),
                    longitud: Number(c.longitud),
                    precision_m: c.precision_m === null ? null : Number(c.precision_m),
                  }
                : null,
          }
        : null,
      fotos: v.evidencia_campo.map((f) => ({
        id: f.id,
        url: urls.get(f.ruta) ?? null,
        sha256: f.sha256,
        capturada_en: f.capturada_en,
        ubicacion: f.latitud !== null,
      })),
    };
  });
}
