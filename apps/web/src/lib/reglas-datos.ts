import "server-only";
import type { Json } from "@sigma/modelo";
import { ejecutarReglas, type Alerta, type DatosReglas } from "@sigma/reglas";
import { z } from "zod";
import { leerTodo } from "@/lib/red-datos";
import { clienteServidor } from "@/lib/supabase/servidor";
import { describirUbicacion, diaMexico } from "@/lib/vista-datos";

type Cliente = Awaited<ReturnType<typeof clienteServidor>>;

const hojaSchema = z.object({ hoja: z.string() }).partial().catch({});
const RFC = /^[A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3}$/;
const texto = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

/** Datos del encargo que leen las reglas: solo registros validados (regla 4). */
export async function cargarDatosReglas(
  supabase: Cliente,
  encargoId: string,
): Promise<DatosReglas> {
  const VALIDADOS = ["validado", "corregido"];
  const [registros, extracciones, entidades, vinculos, eventos, evidencias] = await Promise.all([
    leerTodo((d, h) =>
      supabase
        .from("registro")
        .select("id, resumen, origen")
        .eq("encargo_id", encargoId)
        .in("estado_validacion", VALIDADOS)
        .order("id")
        .range(d, h),
    ),
    leerTodo((d, h) =>
      supabase
        .from("extraccion")
        .select(
          "id, registro_id, campo, valor_crudo, valor_normalizado, ubicacion, metodo, estado, registro!inner(estado_validacion)",
        )
        .eq("encargo_id", encargoId)
        // Las pendientes solo se usan como lectura del documento de una captura (R11).
        .in("estado", [...VALIDADOS, "pendiente"])
        .in("registro.estado_validacion", VALIDADOS)
        .order("id")
        .range(d, h),
    ),
    leerTodo((d, h) =>
      supabase
        .from("entidad")
        .select("id, tipo, nombre, nombre_normalizado, identificadores")
        .eq("encargo_id", encargoId)
        .order("id")
        .range(d, h),
    ),
    leerTodo((d, h) =>
      supabase
        .from("vinculo")
        .select("id, origen_id, destino_id, tipo")
        .eq("encargo_id", encargoId)
        .order("id")
        .range(d, h),
    ),
    leerTodo((d, h) =>
      supabase
        .from("evento")
        .select("id, tipo, fecha_hora, monto, atributos, evento_participante(entidad_id, rol)")
        .eq("encargo_id", encargoId)
        .order("id")
        .range(d, h),
    ),
    leerTodo((d, h) =>
      supabase
        .from("evidencia")
        .select("objeto_id, registro_id")
        .eq("encargo_id", encargoId)
        .in("objeto_tipo", ["vinculo", "evento"])
        .order("id")
        .range(d, h),
    ),
  ]);

  const validos = new Set(registros.map((r) => r.id));
  const registroDe = new Map<string, string>();
  for (const e of evidencias)
    if (validos.has(e.registro_id) && !registroDe.has(e.objeto_id))
      registroDe.set(e.objeto_id, e.registro_id);

  const porRegistro = new Map<string, DatosReglas["registros"][number]>(
    registros.map((r) => [r.id, { id: r.id, hoja: null, resumen: r.resumen, extracciones: [] }]),
  );
  const esCaptura = new Set(registros.filter((r) => r.origen === "captura").map((r) => r.id));
  for (const x of extracciones) {
    const r = porRegistro.get(x.registro_id);
    if (!r) continue;
    // En una captura, lo que la IA leyó del documento asociado no es dato del registro: se compara
    // con lo capturado (R11). En cualquier otro registro, lo pendiente todavía no cuenta (regla 4).
    const lectura = x.metodo === "ia" && esCaptura.has(x.registro_id);
    if (!lectura && x.estado === "pendiente") continue;
    const destino = lectura ? (r.lecturas_documento ??= []) : r.extracciones;
    r.hoja ??= hojaSchema.parse(x.ubicacion).hoja ?? null;
    destino.push({
      id: x.id,
      campo: x.campo,
      valor_crudo: x.valor_crudo,
      valor_normalizado: x.valor_normalizado,
      ubicacion: describirUbicacion(x.ubicacion),
    });
  }

  return {
    coincidencias_69b: await cargarCoincidencias69b(supabase, encargoId, VALIDADOS),
    verificaciones_campo: await cargarVerificacionesCampo(supabase, encargoId),
    registros: [...porRegistro.values()],
    entidades: entidades.map((e) => {
      const ids = (e.identificadores ?? {}) as Record<string, unknown>;
      const invalidos = Array.isArray(ids.invalidos) ? ids.invalidos : [];
      const rfc = texto(ids.rfc);
      return {
        id: e.id,
        tipo: e.tipo,
        nombre: e.nombre,
        nombre_normalizado: e.nombre_normalizado,
        rfc:
          rfc && !invalidos.includes("rfc") && RFC.test(rfc.toUpperCase())
            ? rfc.toUpperCase()
            : null,
      };
    }),
    // Un vínculo o evento sin registro validado no participa (sin origen no hay alerta).
    vinculos: vinculos
      .filter((v) => registroDe.has(v.id))
      .map((v) => ({ ...v, registro_id: registroDe.get(v.id) ?? null })),
    eventos: eventos
      .filter((e) => registroDe.has(e.id))
      .map((e) => {
        const atributos = (e.atributos ?? {}) as Record<string, unknown>;
        return {
          id: e.id,
          registro_id: registroDe.get(e.id) ?? null,
          tipo: e.tipo,
          fecha: diaMexico(e.fecha_hora),
          monto: e.monto === null ? null : Number(e.monto).toFixed(2),
          monto_pagado: texto(atributos.monto_pagado),
          tipo_operacion: texto(atributos.tipo_operacion),
          participantes: e.evento_participante.map((p) => ({
            entidad_id: p.entidad_id,
            rol: p.rol,
          })),
        };
      }),
  };
}

/** Lo que se guarda en `alerta.detalle` (se muestra tal cual en la pantalla de alertas). */
export const detalleAlertaSchema = z
  .object({
    titulo: z.string(),
    descripcion: z.string(),
    entidades: z.array(z.string()),
    evidencias: z.array(
      z.object({
        lado: z.enum(["a", "b"]),
        etiqueta: z.string(),
        valor: z.string(),
        registro_id: z.string(),
        extraccion_id: z.string().nullable(),
        ubicacion: z.string().nullable(),
      }),
    ),
  })
  .catch({ titulo: "Alerta", descripcion: "", entidades: [], evidencias: [] });

function aCarga(encargoId: string, alertas: Alerta[], reglas: string[]) {
  return {
    encargo_id: encargoId,
    reglas,
    alertas: alertas.map((a) => ({
      regla: a.regla,
      severidad: a.severidad,
      huella: a.huella,
      detalle: {
        titulo: a.titulo,
        descripcion: a.descripcion,
        entidades: a.entidades,
        evidencias: a.evidencias,
      },
      evidencias: a.evidencias.map((e) => ({
        registro_id: e.registro_id,
        extraccion_id: e.extraccion_id,
      })),
    })),
  };
}

const resultadoSchema = z.object({
  nuevas: z.number(),
  reproducidas: z.number(),
  no_vigentes: z.number(),
});

const datos69bSchema = z
  .object({
    situacion: z.string().catch("otro"),
    rfc: z.string().nullable().optional().catch(null),
    nombre: z.string().nullable().optional().catch(null),
    carga_vigente_desde: z.string().nullable().optional().catch(null),
    carga_sha256: z.string().nullable().optional().catch(null),
  })
  .catch({ situacion: "otro" });

/**
 * Coincidencias con la lista 69-B que cuentan para R10 (todo menos lo descartado) y, para cada
 * entidad, un registro validado donde aparece (la evidencia de la alerta).
 */
const respuestasCampoSchema = z.record(z.string(), z.string()).catch({});

/** Cédulas de campo sincronizadas (R12), con el proveedor visitado y cuántas fotos traen. */
async function cargarVerificacionesCampo(
  supabase: Cliente,
  encargoId: string,
): Promise<NonNullable<DatosReglas["verificaciones_campo"]>> {
  const { data, error } = await supabase
    .from("cedula_campo")
    .select(
      "id, registro_id, respuestas, capturada_en, visita_campo!inner(entidad_id, entidad(nombre)), evidencia_campo(id)",
    )
    .eq("encargo_id", encargoId)
    .limit(5000);
  if (error) throw new Error(`cedula_campo ${error.code ?? "?"}`);
  return (data ?? []).map((c) => ({
    cedula_id: c.id,
    registro_id: c.registro_id,
    entidad_id: c.visita_campo.entidad_id,
    entidad: c.visita_campo.entidad?.nombre ?? "(sin nombre)",
    capturada_en: c.capturada_en,
    respuestas: respuestasCampoSchema.parse(c.respuestas),
    evidencias: c.evidencia_campo.length,
  }));
}

async function cargarCoincidencias69b(
  supabase: Cliente,
  encargoId: string,
  validados: string[],
): Promise<NonNullable<DatosReglas["coincidencias_69b"]>> {
  const resultados = await leerTodo((d, h) =>
    supabase
      .from("resultado_consulta")
      .select("id, entidad_id, coincidencia, estado, datos, fuente_consulta!inner(conector)")
      .eq("encargo_id", encargoId)
      .eq("fuente_consulta.conector", "lista_69b")
      .neq("estado", "descartada")
      .order("id")
      .range(d, h),
  );
  if (!resultados.length) return [];
  const entidades = [...new Set(resultados.map((r) => r.entidad_id))];
  const menciones = await leerTodo((d, h) =>
    supabase
      .from("registro_entidad")
      .select("registro_id, entidad_id, registro!inner(estado_validacion)")
      .eq("encargo_id", encargoId)
      .in("entidad_id", entidades)
      .in("registro.estado_validacion", validados)
      .order("registro_id")
      .range(d, h),
  );
  const registroDe = new Map<string, string>();
  for (const m of menciones)
    if (!registroDe.has(m.entidad_id)) registroDe.set(m.entidad_id, m.registro_id);
  return resultados.map((r) => {
    const d = datos69bSchema.parse(r.datos);
    const fecha = d.carga_vigente_desde ? diaMexico(d.carga_vigente_desde) : null;
    return {
      resultado_id: r.id,
      entidad_id: r.entidad_id,
      coincidencia: r.coincidencia === "exacta" ? "exacta" : "propuesta",
      confirmada: r.estado === "confirmada",
      situacion: d.situacion,
      rfc: d.rfc ?? null,
      nombre_en_lista: d.nombre ?? null,
      carga:
        fecha || d.carga_sha256
          ? [
              fecha ? `carga del ${fecha.split("-").reverse().join("/")}` : "carga vigente",
              d.carga_sha256 ? `SHA-256 ${d.carga_sha256.slice(0, 8)}…` : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : null,
      registro_id: registroDe.get(r.entidad_id) ?? null,
    };
  });
}

/** Ejecuta las reglas activas sobre el encargo y guarda las alertas con sus evidencias. */
export async function ejecutarYGuardarReglas(supabase: Cliente, encargoId: string) {
  const datos = await cargarDatosReglas(supabase, encargoId);
  const { alertas, reglas } = ejecutarReglas(datos);
  const { data, error } = await supabase.rpc("guardar_alertas", {
    p: JSON.parse(JSON.stringify(aCarga(encargoId, alertas, reglas))) as Json,
  });
  if (error) return { ok: false as const, codigo: error.code };
  return { ok: true as const, ...resultadoSchema.parse(data) };
}
