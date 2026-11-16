"use server";

import { puede, type Json } from "@sigma/modelo";
import { calificar, generarRed, indicadores, proponerFusiones } from "@sigma/red";
import { redirect } from "next/navigation";
import { z } from "zod";
import { mensajeDeError } from "@/lib/errores-db";
import type { EstadoFormulario } from "@/lib/formulario";
import { cargarDatosRed, cargarReglas } from "@/lib/red-datos";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

const SIN_PERMISO: EstadoFormulario = { ok: false, mensaje: "Tu rol no permite esta acción." };
const uuid = z.uuid();

async function encargoDeLaOrganizacion(encargoId: unknown, organizacionId: string) {
  const id = uuid.safeParse(encargoId);
  if (!id.success) return null;
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("encargo")
    .select("id")
    .eq("id", id.data)
    .eq("organizacion_id", organizacionId)
    .maybeSingle();
  return data ? { supabase, id: data.id } : null;
}

export async function generarRedAccion(
  _e: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "red.generar")) return SIN_PERMISO;
  const encargo = await encargoDeLaOrganizacion(formData.get("encargo_id"), activa.organizacionId);
  if (!encargo) return { ok: false, mensaje: "El encargo no existe o no tienes acceso." };

  const todas = formData.get("todas") === "1";
  const alcance = formData.get("alcance") === "2" ? 2 : 1;
  const semillas = formData
    .getAll("semillas")
    .map(String)
    .filter((s) => uuid.safeParse(s).success);
  if (!todas && semillas.length === 0) {
    return {
      ok: false,
      mensaje: "Elige al menos una entidad semilla o marca «todas las entidades».",
    };
  }

  const { supabase } = encargo;
  const [datos, { version, reglas }, existentes] = await Promise.all([
    cargarDatosRed(supabase, encargo.id),
    cargarReglas(supabase, activa.organizacionId),
    supabase.from("fusion_propuesta").select("entidad_a, entidad_b").eq("encargo_id", encargo.id),
  ]);
  if (datos.entidades.length === 0)
    return { ok: false, mensaje: "El encargo todavía no tiene entidades." };

  const red = generarRed(datos, { semillas: todas ? "todas" : semillas, alcance });
  if (red.nodos.length === 0)
    return { ok: false, mensaje: "Las semillas no tienen registros validados." };
  const calificaciones = calificar(red, datos, reglas);
  const fusiones = proponerFusiones(datos.entidades, existentes.data ?? []);

  const carga = {
    organizacion_id: activa.organizacionId,
    encargo_id: encargo.id,
    semillas: red.semillas,
    alcance: red.alcance,
    version_reglas: version,
    resumen: {
      indicadores: indicadores(red, datos, calificaciones),
      todas,
      eventos: red.eventos.length,
    },
    nodos: red.nodos,
    vinculos: red.vinculos,
    calificaciones,
    fusiones,
  };
  const { data, error } = await supabase.rpc("guardar_red", {
    p: JSON.parse(JSON.stringify(carga)) as Json,
  });
  if (error || !data) return { ok: false, mensaje: mensajeDeError(error, "guardarRed") };
  redirect(`/encargos/${encargo.id}/red?gen=${data}`);
}

const ajusteSchema = z.object({
  calificacion_id: z.uuid(),
  ajuste_nivel: z.enum(["critico", "alto", "medio", "bajo"]),
  ajuste_motivo: z.string().trim().min(3, "Escribe el motivo del ajuste").max(500),
});

export async function ajustarNivel(
  _e: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { activa, usuario } = await requerirOrganizacion();
  if (!puede(activa.rol, "red.ajustar")) return SIN_PERMISO;
  const datos = ajusteSchema.safeParse({
    calificacion_id: formData.get("calificacion_id"),
    ajuste_nivel: formData.get("ajuste_nivel"),
    ajuste_motivo: formData.get("ajuste_motivo"),
  });
  if (!datos.success)
    return { ok: false, mensaje: datos.error.issues[0]?.message ?? "Datos inválidos." };
  const supabase = await clienteServidor();
  const { data, error } = await supabase
    .from("calificacion")
    .update({
      ajuste_nivel: datos.data.ajuste_nivel,
      ajuste_motivo: datos.data.ajuste_motivo,
      ajustado_por: usuario.id,
    })
    .eq("id", datos.data.calificacion_id)
    .eq("organizacion_id", activa.organizacionId)
    .select("id")
    .maybeSingle();
  if (error) return { ok: false, mensaje: mensajeDeError(error, "ajustarNivel") };
  if (!data) return SIN_PERMISO;
  return { ok: true, mensaje: "Nivel ajustado." };
}

export async function resolverFusionAccion(formData: FormData): Promise<void> {
  const { activa } = await requerirOrganizacion();
  const encargoId = uuid.safeParse(formData.get("encargo_id"));
  const fusion = uuid.safeParse(formData.get("fusion_id"));
  if (!encargoId.success || !fusion.success || !puede(activa.rol, "fusion.resolver")) {
    redirect("/encargos");
  }
  const supabase = await clienteServidor();
  const { error } = await supabase.rpc("resolver_fusion", {
    p_fusion: fusion.data,
    p_aceptar: formData.get("aceptar") === "1",
  });
  if (error) mensajeDeError(error, "resolverFusion");
  redirect(`/encargos/${encargoId.data}/red#fusiones`);
}

const numeroPositivo = z.coerce.number().min(0).max(1000);

export async function guardarReglas(
  _e: EstadoFormulario,
  formData: FormData,
): Promise<EstadoFormulario> {
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "reglas.editar"))
    return { ok: false, mensaje: "Solo un administrador edita las reglas." };
  const leer = (k: string) => numeroPositivo.safeParse(formData.get(k));
  const campos = [
    "riesgo_critico",
    "riesgo_alto",
    "riesgo_medio",
    "tipo_declarado",
    "alertas_abiertas",
    "vinculo_fuerte_con_critico",
    "fuerza_minima",
    "evento_con_etapa",
    "fuerza_vinculo",
  ] as const;
  const v: Record<string, number> = {};
  for (const c of campos) {
    const r = leer(c);
    if (!r.success)
      return { ok: false, mensaje: "Todos los pesos deben ser números entre 0 y 1000." };
    v[c] = r.data;
  }
  const patron = String(formData.get("patron") ?? "").trim() || "FANTASMA|FACHADA|OFFSHORE";
  try {
    new RegExp(patron);
  } catch {
    return { ok: false, mensaje: "El patrón de tipos no es una expresión válida." };
  }
  const reglas = [
    {
      criterio: "riesgo_declarado",
      peso: v.riesgo_critico,
      parametros: {
        niveles: { CRITICO: v.riesgo_critico, ALTO: v.riesgo_alto, MEDIO: v.riesgo_medio },
      },
    },
    { criterio: "tipo_declarado", peso: v.tipo_declarado, parametros: { patron } },
    {
      criterio: "alertas_abiertas",
      peso: v.alertas_abiertas,
      parametros: { reglas: ["R06", "R07", "R08", "R09", "R10"] },
    },
    {
      criterio: "vinculo_fuerte_con_critico",
      peso: v.vinculo_fuerte_con_critico,
      parametros: { fuerza_minima: Math.min(10, Math.max(1, Math.round(v.fuerza_minima ?? 7))) },
    },
    { criterio: "evento_con_etapa", peso: v.evento_con_etapa, parametros: {} },
    { criterio: "fuerza_vinculo", peso: v.fuerza_vinculo, parametros: {} },
  ];
  const supabase = await clienteServidor();
  const { data, error } = await supabase.rpc("nueva_version_reglas", {
    p_organizacion: activa.organizacionId,
    p_reglas: reglas as unknown as Json,
  });
  if (error) return { ok: false, mensaje: mensajeDeError(error, "guardarReglas") };
  return {
    ok: true,
    mensaje: `Reglas guardadas como versión ${data}. Regenera la red para aplicarlas.`,
  };
}
