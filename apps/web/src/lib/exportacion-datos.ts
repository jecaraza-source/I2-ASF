import "server-only";
import type { EventoExport, NivelExport, RedExport } from "@sigma/i2-export";
import { z } from "zod";
import { cargarGeneracion, leerTodo } from "@/lib/red-datos";
import { clienteServidor } from "@/lib/supabase/servidor";
import { enLotes, ultimaGeneracion } from "@/lib/vista-datos";

type Cliente = Awaited<ReturnType<typeof clienteServidor>>;

const identificadoresSchema = z
  .object({
    rfc: z.string().optional(),
    curp: z.string().optional(),
    telefono: z.string().optional(),
  })
  .catch({});
const detalleAlertaSchema = z
  .object({
    titulo: z.string().catch(""),
    entidades: z.array(z.string()).catch([]),
  })
  .catch({ titulo: "", entidades: [] });

/** Sigue `fusionada_en` hasta la entidad canónica (como lo hace la red al generarse). */
function canonizar(fusion: Map<string, string | null>) {
  return (id: string) => {
    let actual = id;
    for (let i = 0; i < 20; i++) {
      const siguiente = fusion.get(actual);
      if (!siguiente) return actual;
      actual = siguiente;
    }
    return actual;
  };
}

/**
 * La red más reciente del encargo lista para exportar. Con `expedienteId`, solo las entidades de la
 * red que aparecen en registros de ese expediente, y lo que las une. Devuelve null si no hay red
 * generada o si el expediente no es del encargo.
 */
export async function cargarRedExportable(
  supabase: Cliente,
  encargo: { id: string; nombre: string },
  expedienteId?: string,
): Promise<RedExport | null> {
  const gen = await ultimaGeneracion(supabase, encargo.id);
  if (!gen) return null;

  let alcance: RedExport["alcance"] = { tipo: "red" };
  let delExpediente: Set<string> | null = null;
  const fusionadas = await leerTodo((d, h) =>
    supabase
      .from("entidad")
      .select("id, fusionada_en")
      .eq("encargo_id", encargo.id)
      .not("fusionada_en", "is", null)
      .order("id")
      .range(d, h),
  );
  const canonica = canonizar(new Map(fusionadas.map((e) => [e.id, e.fusionada_en])));

  if (expedienteId) {
    const { data: exp } = await supabase
      .from("expediente")
      .select("id, identificador")
      .eq("id", expedienteId)
      .eq("encargo_id", encargo.id)
      .maybeSingle();
    if (!exp) return null;
    alcance = { tipo: "expediente", id: exp.id, identificador: exp.identificador };
    const menciones = await leerTodo((d, h) =>
      supabase
        .from("registro_entidad")
        .select("entidad_id, registro!inner(expediente_id)")
        .eq("encargo_id", encargo.id)
        .eq("registro.expediente_id", exp.id)
        .order("id")
        .range(d, h),
    );
    delExpediente = new Set(menciones.map((m) => canonica(m.entidad_id)));
  }

  const generacion = await cargarGeneracion(supabase, gen.id);
  const ids = generacion.nodos
    .map((n) => n.entidad_id)
    .filter((id) => !delExpediente || delExpediente.has(id));
  const enRed = new Set(ids);
  const [entidades, vinculos, eventos, alertas] = await Promise.all([
    enLotes(ids, (lote) =>
      supabase
        .from("entidad")
        .select("id, nombre, tipo, identificadores, riesgo_declarado")
        .eq("encargo_id", encargo.id)
        .in("id", lote),
    ),
    enLotes(generacion.vinculos, (lote) =>
      supabase
        .from("vinculo")
        .select("id, origen_id, destino_id, tipo, fuerza, dirigido, fecha_inicio")
        .eq("encargo_id", encargo.id)
        .in("id", lote),
    ),
    leerTodo((d, h) =>
      supabase
        .from("evento")
        .select("id, tipo, fecha_hora, monto, moneda, evento_participante(entidad_id, rol)")
        .eq("encargo_id", encargo.id)
        .order("id")
        .range(d, h),
    ),
    leerTodo((d, h) =>
      supabase
        .from("alerta")
        .select("id, regla, severidad, estado, detalle")
        .eq("encargo_id", encargo.id)
        .eq("vigente", true)
        .order("id")
        .range(d, h),
    ),
  ]);

  const cal = new Map(generacion.calificaciones.map((c) => [`${c.objeto_tipo}:${c.objeto_id}`, c]));
  const nivelDe = (tipo: string, id: string) => {
    const c = cal.get(`${tipo}:${id}`);
    return c ? { nivel: (c.ajuste_nivel ?? c.nivel) as NivelExport, c } : null;
  };

  return {
    encargo: { id: encargo.id, nombre: encargo.nombre },
    alcance,
    red: { id: gen.id, generada_en: gen.generada_en },
    entidades: entidades.map((e) => {
      const ids = identificadoresSchema.parse(e.identificadores);
      const n = nivelDe("entidad", e.id);
      return {
        id: e.id,
        nombre: e.nombre,
        tipo: e.tipo,
        rfc: ids.rfc ?? null,
        curp: ids.curp ?? null,
        telefono: ids.telefono ?? null,
        riesgo_declarado: e.riesgo_declarado,
        nivel: n?.nivel ?? "bajo",
        puntaje: n?.c.puntaje ?? 0,
        ajuste_motivo: n?.c.ajuste_nivel ? (n.c.ajuste_motivo ?? null) : null,
        criterios: n?.c.criterios ?? [],
      };
    }),
    vinculos: vinculos
      .filter((v) => enRed.has(v.origen_id) && enRed.has(v.destino_id))
      .map((v) => {
        const n = nivelDe("vinculo", v.id);
        return {
          id: v.id,
          origen_id: v.origen_id,
          destino_id: v.destino_id,
          tipo: v.tipo,
          fuerza: v.fuerza,
          dirigido: v.dirigido,
          fecha_inicio: v.fecha_inicio,
          nivel: n?.nivel ?? null,
          puntaje: n ? n.c.puntaje : null,
        };
      }),
    // Un evento entra si une al menos a dos entidades distintas de la red.
    eventos: eventos.flatMap((e): EventoExport[] => {
      const participantes = e.evento_participante.map((p) => ({
        entidad_id: canonica(p.entidad_id),
        rol: p.rol,
      }));
      const dentro = new Set(participantes.map((p) => p.entidad_id).filter((id) => enRed.has(id)));
      if (dentro.size < 2) return [];
      return [
        {
          id: e.id,
          tipo: e.tipo,
          fecha: e.fecha_hora,
          monto: e.monto === null ? null : Number(e.monto),
          moneda: e.moneda,
          participantes,
        },
      ];
    }),
    alertas: alertas.flatMap((a) => {
      const d = detalleAlertaSchema.parse(a.detalle);
      const entidadesAlerta = [...new Set(d.entidades.map(canonica))].filter((id) => enRed.has(id));
      if (!entidadesAlerta.length) return [];
      return [
        {
          id: a.id,
          regla: a.regla,
          severidad: a.severidad,
          estado: a.estado,
          titulo: d.titulo || a.regla,
          entidades: entidadesAlerta,
        },
      ];
    }),
  };
}
