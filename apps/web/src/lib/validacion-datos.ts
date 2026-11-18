import "server-only";
import {
  MONEDAS,
  ROLES_INVOLUCRADO,
  TIPOS_INVOLUCRADO,
  camposComunesDe,
  leerCamposEsperados,
} from "@sigma/importador/captura";
import { z } from "zod";
import type { Anotacion, InicialRegistro } from "@/components/captura/formulario-registro";
import { clienteServidor } from "@/lib/supabase/servidor";

type Cliente = Awaited<ReturnType<typeof clienteServidor>>;

/** Documentos leídos por la IA que esperan la decisión del auditor. */
export async function colaValidacion(supabase: Cliente, encargoId: string) {
  const { data: registros } = await supabase
    .from("registro")
    .select(
      "id, resumen, creado_en, extraccion_nota, tipo_documento(nombre), documento_origen(nombre_archivo)",
    )
    .eq("encargo_id", encargoId)
    .eq("origen", "documento")
    .eq("estado_extraccion", "hecha")
    .eq("estado_validacion", "pendiente")
    .order("creado_en")
    .limit(200);
  const ids = (registros ?? []).map((r) => r.id);
  const { data: lecturas } = ids.length
    ? await supabase
        .from("extraccion")
        .select("registro_id, estado")
        .eq("encargo_id", encargoId)
        .eq("metodo", "ia")
        .in("registro_id", ids)
    : { data: [] };
  const conteo = new Map<string, { total: number; porRevisar: number }>();
  for (const l of lecturas ?? []) {
    const c = conteo.get(l.registro_id) ?? { total: 0, porRevisar: 0 };
    c.total += 1;
    if (l.estado === "pendiente") c.porRevisar += 1;
    conteo.set(l.registro_id, c);
  }
  return (registros ?? []).map((r) => ({
    id: r.id,
    archivo: r.documento_origen?.nombre_archivo ?? r.resumen ?? "Documento",
    tipo: r.tipo_documento?.nombre ?? "Sin tipo",
    creadoEn: r.creado_en,
    proveedor: r.extraccion_nota,
    ...(conteo.get(r.id) ?? { total: 0, porRevisar: 0 }),
  }));
}

const involucradoSchema = z.object({
  tipo: z.enum(TIPOS_INVOLUCRADO).catch("persona_moral"),
  rol: z.enum(ROLES_INVOLUCRADO).catch("otro"),
  nombre: z.string().catch(""),
  nombre_original: z.string().optional().catch(undefined),
  rfc: z.string().optional().catch(undefined),
  curp: z.string().optional().catch(undefined),
  aportacion_texto: z.string().optional().catch(undefined),
});
const montoSchema = z.object({ moneda: z.enum(MONEDAS) });
const paginaSchema = z.object({ pagina: z.number().int().positive().optional() }).catch({});

/** Un registro de la cola con lo que leyó la IA, listo para el formulario de validación. */
export async function registroPorValidar(supabase: Cliente, encargoId: string, registroId: string) {
  const { data: r } = await supabase
    .from("registro")
    .select(
      "id, expediente_id, tipo_documento_id, documento_id, origen, estado_extraccion, estado_validacion, extraccion_nota, tipo_documento(id, clave, nombre, campos_esperados, categoria_documental(nombre)), documento_origen(id, nombre_archivo, mime, storage_path)",
    )
    .eq("id", registroId)
    .eq("encargo_id", encargoId)
    .maybeSingle();
  if (!r || !r.tipo_documento || !r.documento_origen) return null;
  const { data: lecturas } = await supabase
    .from("extraccion")
    .select("id, campo, valor_crudo, valor_normalizado, confianza, ubicacion, estado")
    .eq("registro_id", r.id)
    .eq("metodo", "ia")
    .order("creado_en");

  const campos = leerCamposEsperados(r.tipo_documento.campos_esperados);
  const valores: Record<string, string> = {};
  const involucrados: InicialRegistro["involucrados"] = [];
  const anotaciones: Record<string, Anotacion> = {};
  let moneda: InicialRegistro["moneda"] = "MXN";

  for (const l of lecturas ?? []) {
    anotaciones[l.campo] = {
      confianza: Number(l.confianza ?? 0),
      pagina: paginaSchema.parse(l.ubicacion).pagina ?? null,
      porRevisar: l.estado === "pendiente",
    };
    if (/^involucrado_\d+$/.test(l.campo)) {
      const v = involucradoSchema.safeParse(l.valor_normalizado);
      if (!v.success) continue;
      involucrados.push({
        tipo: v.data.tipo,
        rol: v.data.rol,
        nombre: v.data.nombre_original ?? v.data.nombre,
        rfc: v.data.rfc ?? "",
        curp: v.data.curp ?? "",
        aportacion: v.data.aportacion_texto ?? "",
        campoIa: l.campo,
      });
      continue;
    }
    // Las fechas legibles van en ISO (el control es un calendario); lo demás, tal como se leyó.
    valores[l.campo] =
      l.campo === "fecha_documento" || campos.find((c) => c.clave === l.campo)?.tipo === "fecha"
        ? typeof l.valor_normalizado === "string"
          ? l.valor_normalizado
          : ""
        : (l.valor_crudo ?? "");
    if (l.campo === "monto") {
      const m = montoSchema.safeParse(l.valor_normalizado);
      if (m.success) moneda = m.data.moneda;
    }
  }

  return {
    id: r.id,
    enCola:
      r.origen === "documento" &&
      r.estado_extraccion === "hecha" &&
      r.estado_validacion === "pendiente",
    estadoValidacion: r.estado_validacion,
    proveedor: r.extraccion_nota,
    documento: r.documento_origen,
    tipo: {
      id: r.tipo_documento.id,
      clave: r.tipo_documento.clave,
      nombre: r.tipo_documento.nombre,
      categoria: r.tipo_documento.categoria_documental?.nombre ?? "Sin categoría",
      campos,
      comunes: camposComunesDe(r.tipo_documento.campos_esperados),
      campos_esperados: r.tipo_documento.campos_esperados,
    },
    lecturas: lecturas ?? [],
    inicial: {
      tipoId: r.tipo_documento.id,
      expedienteId: r.expediente_id ?? "",
      moneda,
      valores,
      involucrados,
    } satisfies InicialRegistro,
    anotaciones,
  };
}
