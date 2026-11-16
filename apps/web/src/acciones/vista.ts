"use server";

import { z } from "zod";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";
import { cargarEvidencia, cargarFicha, type EvidenciaArista, type Ficha } from "@/lib/vista-datos";

const fichaSchema = z.object({ encargoId: z.uuid(), entidadId: z.uuid() });

/** Ficha resumida para el panel lateral del visor (lectura; RLS decide qué se ve). */
export async function obtenerFicha(entrada: unknown): Promise<Ficha | null> {
  const p = fichaSchema.safeParse(entrada);
  if (!p.success) return null;
  await requerirOrganizacion();
  const supabase = await clienteServidor();
  return cargarFicha(supabase, p.data.encargoId, p.data.entidadId);
}

const evidenciaSchema = z.object({
  encargoId: z.uuid(),
  clase: z.enum(["vinculo", "evento"]),
  objetos: z.array(z.uuid()).min(1).max(2000),
});

/** Evidencia de una arista del visor: vínculos o eventos y sus registros de origen. */
export async function obtenerEvidencia(entrada: unknown): Promise<EvidenciaArista | null> {
  const p = evidenciaSchema.safeParse(entrada);
  if (!p.success) return null;
  await requerirOrganizacion();
  const supabase = await clienteServidor();
  return cargarEvidencia(supabase, p.data.encargoId, p.data.clase, p.data.objetos);
}
