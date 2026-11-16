import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { z } from "zod";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

/** Encargo de la organización activa o 404. RLS ya filtra; esto evita mezclar organizaciones en pantalla. */
export const obtenerEncargo = cache(async (id: string) => {
  if (!z.uuid().safeParse(id).success) notFound();
  const { activa } = await requerirOrganizacion();
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("encargo")
    .select(
      "id, organizacion_id, nombre, tipo_auditoria, umbral_confianza, periodo_inicio, periodo_fin, estado, creado_en",
    )
    .eq("id", id)
    .eq("organizacion_id", activa.organizacionId)
    .maybeSingle();
  if (!data) notFound();
  return data;
});

export const obtenerExpediente = cache(async (encargoId: string, id: string) => {
  if (!z.uuid().safeParse(id).success) notFound();
  const encargo = await obtenerEncargo(encargoId);
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("expediente")
    .select("id, encargo_id, numero_control, identificador, descripcion, creado_en")
    .eq("id", id)
    .eq("encargo_id", encargo.id)
    .maybeSingle();
  if (!data) notFound();
  return data;
});

export function formatoFecha(iso: string | null): string {
  if (!iso) return "—";
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${d}/${m}/${a}`;
}
