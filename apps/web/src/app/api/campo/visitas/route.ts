import { NextResponse } from "next/server";
import { mensajeDeError } from "@/lib/errores-db";
import { SIN_CACHE } from "@/lib/campo-api";
import { obtenerSesion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

/** Visitas asignadas a quien llama, para guardarlas en el teléfono y trabajar sin señal. */
export async function GET() {
  const sesion = await obtenerSesion();
  if (!sesion)
    return NextResponse.json({ error: "Sin sesión" }, { status: 401, headers: SIN_CACHE });
  const supabase = await clienteServidor();
  const { data, error } = await supabase.rpc("campo_mis_visitas");
  if (error) {
    return NextResponse.json(
      { error: mensajeDeError(error, "campoVisitas") },
      { status: 500, headers: SIN_CACHE },
    );
  }
  return NextResponse.json(
    { usuario_id: sesion.usuario.id, visitas: data ?? [] },
    { headers: SIN_CACHE },
  );
}
