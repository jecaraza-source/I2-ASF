import "server-only";
import { llamarConRespaldo } from "@sigma/importador/extraccion";
import {
  construirPeticionSintesis,
  esquemaSintesis,
  interpretarSintesis,
  simularSintesis,
  type RegistroParaSintesis,
} from "@sigma/importador/sintesis";
import { PROVEEDORES_IA, type Json, type ProveedorIA } from "@sigma/modelo";
import { z } from "zod";
import { iaPermitida, registrarUsoIA } from "@/lib/ia/control";
import { llamarProveedor } from "@/lib/ia/proveedores";
import type { clienteServicio } from "@/lib/supabase/servicio";

type Servicio = NonNullable<ReturnType<typeof clienteServicio>>;

const payloadSchema = z.object({ sintesis_id: z.uuid() });
const identificadoresSchema = z.object({ rfc: z.string().optional() }).catch({});

/** Datos validados de los registros del alcance: lo único que ve el modelo. */
async function cargarRegistros(
  servicio: Servicio,
  encargoId: string,
  ids: string[],
): Promise<RegistroParaSintesis[]> {
  const [registros, extracciones, menciones] = await Promise.all([
    servicio
      .from("registro")
      .select(
        "id, resumen, fuente, fecha_documento, estado_validacion, tipo_documento(nombre), expediente(identificador)",
      )
      .eq("encargo_id", encargoId)
      .in("id", ids),
    servicio
      .from("extraccion")
      .select("registro_id, campo, valor_crudo")
      .eq("encargo_id", encargoId)
      .in("registro_id", ids)
      .in("estado", ["validado", "corregido"])
      .not("campo", "like", "involucrado%"),
    servicio
      .from("registro_entidad")
      .select("registro_id, rol, entidad(nombre, identificadores)")
      .eq("encargo_id", encargoId)
      .in("registro_id", ids),
  ]);
  if (registros.error || extracciones.error || menciones.error)
    throw new Error("lectura de registros");
  return (
    (registros.data ?? [])
      // Doble seguro: aunque la base ya lo exige, solo entra lo validado.
      .filter((r) => r.estado_validacion === "validado" || r.estado_validacion === "corregido")
      .map((r) => ({
        id: r.id,
        tipo: r.tipo_documento?.nombre ?? null,
        fecha: r.fecha_documento,
        fuente: r.fuente,
        resumen: r.resumen,
        expediente: r.expediente?.identificador ?? null,
        datos: (extracciones.data ?? [])
          .filter((x) => x.registro_id === r.id && x.valor_crudo)
          .map((x) => ({ campo: x.campo, valor: x.valor_crudo ?? "" })),
        involucrados: (menciones.data ?? [])
          .filter((m) => m.registro_id === r.id && m.entidad)
          .map((m) => ({
            nombre: m.entidad?.nombre ?? "",
            rol: m.rol,
            rfc: identificadoresSchema.parse(m.entidad?.identificadores).rfc ?? null,
          })),
      }))
  );
}

/**
 * Trabajo `sintesis`: arma la petición con los registros validados del alcance, llama a la IA con la
 * política de respaldo (compuerta `iaPermitida` y constancia en `uso_ia`) y guarda las afirmaciones
 * que sobreviven a la validación. Nada del contenido va a los registros de la aplicación.
 */
export async function generarSintesis(
  servicio: Servicio,
  trabajo: { id: string; payload: unknown },
): Promise<void> {
  const { sintesis_id } = payloadSchema.parse(trabajo.payload);
  const { data: s, error } = await servicio
    .from("sintesis")
    .select("id, organizacion_id, encargo_id, alcance_tipo, alcance_id, registros, estado")
    .eq("id", sintesis_id)
    .maybeSingle();
  if (error) throw new Error(`sintesis ${error.code ?? "?"}`);
  if (!s || s.estado !== "generando") return;

  const tipo = s.alcance_tipo === "entidad" ? "entidad" : "expediente";
  const alcance =
    tipo === "expediente"
      ? await servicio
          .from("expediente")
          .select("identificador")
          .eq("id", s.alcance_id)
          .maybeSingle()
      : await servicio.from("entidad").select("nombre").eq("id", s.alcance_id).maybeSingle();
  const nombre =
    (alcance.data &&
      ("identificador" in alcance.data ? alcance.data.identificador : alcance.data.nombre)) ??
    "";
  const registros = await cargarRegistros(servicio, s.encargo_id, s.registros);
  const peticion = construirPeticionSintesis(registros, { tipo, nombre });
  const modelos = new Map<ProveedorIA, string>();

  const r = await llamarConRespaldo<ProveedorIA, ReturnType<typeof interpretarSintesis>>(
    {
      proveedores: PROVEEDORES_IA,
      intentos: 1,
      permitido: async (proveedor) => {
        const permiso = await iaPermitida(servicio, s.encargo_id, proveedor);
        if (!permiso.permitida) return { permitida: false, motivo: permiso.motivo };
        modelos.set(proveedor, permiso.modelo);
        return { permitida: true };
      },
      llamar: (proveedor) =>
        llamarProveedor(proveedor, {
          modelo: modelos.get(proveedor) ?? "",
          sistema: peticion.sistema,
          instruccion: peticion.instruccion,
          esquema: esquemaSintesis(),
          herramienta: "registrar_sintesis",
          simulacion: (p) => simularSintesis(registros, peticion.refs, p),
        }),
      registrar: (uso) =>
        registrarUsoIA(servicio, {
          organizacionId: s.organizacion_id,
          encargoId: s.encargo_id,
          proveedor: uso.proveedor,
          modelo: modelos.get(uso.proveedor) ?? "sin-modelo",
          funcion: "sintesis",
          tokensEntrada: uso.tokensEntrada,
          tokensSalida: uso.tokensSalida,
          resultado: uso.resultado,
          codigoError: uso.codigo,
          duracionMs: uso.duracionMs,
          trabajoId: trabajo.id,
        }),
    },
    (datos) => interpretarSintesis(datos, peticion.refs),
  );

  if (!r.ok) {
    // Bloqueada (IA apagada, topes, sin llave): espera sin consumir intentos. Un fallo del
    // proveedor se reintenta con el trabajo; al tercer intento la síntesis queda en error.
    if (r.clase === "bloqueada") {
      await guardar(servicio, { sintesis_id, estado: "en_espera", motivo: r.motivo });
      return;
    }
    throw new Error(`sintesis_${r.motivo}`.slice(0, 80));
  }
  await guardar(servicio, {
    sintesis_id,
    proveedor: r.proveedor,
    modelo: modelos.get(r.proveedor) ?? "sin-modelo",
    afirmaciones: r.valor ?? [],
  });
}

/** Al agotar los intentos, la síntesis no se queda «generando» para siempre. */
export async function sintesisFallida(servicio: Servicio, payload: unknown): Promise<void> {
  const p = payloadSchema.safeParse(payload);
  if (!p.success) return;
  await guardar(servicio, {
    sintesis_id: p.data.sintesis_id,
    estado: "error",
    motivo: "proveedor",
  });
}

async function guardar(servicio: Servicio, p: Record<string, unknown>) {
  const { error } = await servicio.rpc("guardar_sintesis_ia", { p: p as Json });
  if (error) throw new Error(`guardar_sintesis_ia ${error.code ?? "?"}`);
}
