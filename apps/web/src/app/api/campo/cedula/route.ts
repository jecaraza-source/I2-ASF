import { cedulaCampoSchema } from "@sigma/modelo";
import { after, NextResponse, type NextRequest } from "next/server";
import { entradaCampo, SIN_CACHE } from "@/lib/campo-api";
import { mensajeDeError } from "@/lib/errores-db";
import { clienteServidor } from "@/lib/supabase/servidor";
import { procesarTrabajos } from "@/lib/trabajos";

export const maxDuration = 120;

/**
 * Recibe la cédula contestada: se vuelve un registro «campo» y cierra la visita. Reenviarla devuelve
 * el mismo registro. Al terminar se corren las reglas para que la alerta R12 aparezca enseguida.
 */
export async function POST(request: NextRequest) {
  const entrada = await entradaCampo(request);
  if ("error" in entrada) return entrada.error;
  const p = cedulaCampoSchema.safeParse(entrada.cuerpo);
  if (!p.success) {
    return NextResponse.json(
      { error: "Cédula incompleta o inválida" },
      { status: 400, headers: SIN_CACHE },
    );
  }
  const supabase = await clienteServidor();
  const { data, error } = await supabase.rpc("campo_guardar_cedula", { p: p.data });
  if (error || typeof data !== "string") {
    return NextResponse.json(
      { error: mensajeDeError(error, "campoCedula") },
      { status: error?.code === "42501" ? 403 : 409, headers: SIN_CACHE },
    );
  }
  after(async () => {
    try {
      await procesarTrabajos({ limite: 3 });
    } catch {
      console.error("[campo] las reglas quedan para el cron");
    }
  });
  return NextResponse.json({ ok: true, registro_id: data }, { headers: SIN_CACHE });
}
