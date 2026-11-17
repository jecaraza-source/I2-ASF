import "server-only";
import {
  PROMPT_EXTRACCION,
  camposDeExtraccion,
  esquemaExtraccion,
  extraerConRespaldo,
} from "@sigma/importador/extraccion";
import { PROVEEDORES_IA, type Json, type ProveedorIA } from "@sigma/modelo";
import { z } from "zod";
import { iaPermitida, registrarUsoIA } from "@/lib/ia/control";
import {
  MAX_BYTES_LECTURA,
  MIMES_LEGIBLES,
  llamarProveedor,
  type MimeLegible,
} from "@/lib/ia/proveedores";
import type { clienteServicio } from "@/lib/supabase/servicio";

type Servicio = NonNullable<ReturnType<typeof clienteServicio>>;

const payloadSchema = z.object({ registro_id: z.uuid(), documento_id: z.uuid() });

/** Deja el documento esperando (no es un fallo): IA apagada, tope alcanzado o archivo no legible. */
async function esperar(servicio: Servicio, registroId: string, nota: string) {
  await servicio
    .from("registro")
    .update({ estado_extraccion: "en_espera", extraccion_nota: nota.slice(0, 80) })
    .eq("id", registroId)
    .neq("estado_extraccion", "hecha");
}

/**
 * Trabajo de extracción (§7): lee el original con el proveedor principal (Anthropic) y, si este
 * llegó a su límite y el encargo lo permite, con el de respaldo (OpenAI). Guarda una extracción
 * por campo con su confianza y su página. Idempotente. En los logs solo van IDs y códigos.
 *
 * Lanza un error (con un código corto) cuando conviene reintentar el trabajo más tarde.
 */
export async function extraerDocumento(
  servicio: Servicio,
  trabajo: { id: string; payload: unknown; intentos: number },
): Promise<void> {
  const p = payloadSchema.parse(trabajo.payload);
  const { data: registro, error } = await servicio
    .from("registro")
    .select(
      "id, organizacion_id, encargo_id, estado_extraccion, tipo_documento(nombre, campos_esperados), documento_origen(storage_path, mime, tamano, nombre_archivo)",
    )
    .eq("id", p.registro_id)
    .maybeSingle();
  if (error) throw new Error(`registro ${error.code ?? "?"}`);
  if (!registro || registro.estado_extraccion === "hecha") return;
  const documento = registro.documento_origen;
  if (!documento) return esperar(servicio, registro.id, "sin_documento");

  if (!MIMES_LEGIBLES.includes(documento.mime ?? ""))
    return esperar(servicio, registro.id, "tipo_sin_lectura");
  if ((documento.tamano ?? 0) > MAX_BYTES_LECTURA)
    return esperar(servicio, registro.id, "archivo_grande");

  const { data: encargo } = await servicio
    .from("encargo")
    .select("umbral_confianza")
    .eq("id", registro.encargo_id)
    .maybeSingle();
  const umbral = Number(encargo?.umbral_confianza ?? 0.85);
  const campos = camposDeExtraccion(registro.tipo_documento?.campos_esperados);

  // El archivo solo se descarga si algún proveedor está permitido: nada sale si la IA está apagada.
  let archivo: Uint8Array | null = null;
  const leer = async () => {
    if (archivo) return archivo;
    const descarga = await servicio.storage.from("originales").download(documento.storage_path);
    if (descarga.error || !descarga.data) throw new Error("descarga_fallida");
    archivo = new Uint8Array(await descarga.data.arrayBuffer());
    return archivo;
  };
  const modelos = new Map<ProveedorIA, string>();
  const organizacionId = registro.organizacion_id;

  await servicio
    .from("registro")
    .update({ estado_extraccion: "en_proceso" })
    .eq("id", registro.id)
    .in("estado_extraccion", ["en_cola", "en_espera", "en_proceso", "error"]);

  const resultado = await extraerConRespaldo<ProveedorIA>(
    {
      proveedores: PROVEEDORES_IA,
      // Los reintentos los da el trabajo (3 intentos con espera creciente); aquí uno por proveedor
      // para no exceder el bloqueo de 5 minutos del trabajo.
      intentos: 1,
      permitido: async (proveedor) => {
        const permiso = await iaPermitida(servicio, registro.encargo_id, proveedor);
        if (!permiso.permitida) return { permitida: false, motivo: permiso.motivo };
        modelos.set(proveedor, permiso.modelo);
        return { permitida: true };
      },
      llamar: async (proveedor) =>
        llamarProveedor(proveedor, {
          modelo: modelos.get(proveedor) ?? "",
          sistema: PROMPT_EXTRACCION,
          instruccion: `Tipo de documento: ${registro.tipo_documento?.nombre ?? "sin clasificar"}. Extrae los datos con la herramienta indicada.`,
          esquema: esquemaExtraccion(campos),
          archivo: {
            bytes: await leer(),
            mime: documento.mime as MimeLegible,
            nombre: "documento",
          },
        }),
      registrar: (uso) =>
        registrarUsoIA(servicio, {
          organizacionId,
          encargoId: registro.encargo_id,
          proveedor: uso.proveedor,
          modelo: modelos.get(uso.proveedor) ?? "sin-modelo",
          funcion: "extraccion",
          tokensEntrada: uso.tokensEntrada,
          tokensSalida: uso.tokensSalida,
          resultado: uso.resultado,
          codigoError: uso.codigo,
          duracionMs: uso.duracionMs,
          trabajoId: trabajo.id,
          registroId: registro.id,
        }),
    },
    campos,
    umbral,
  );

  if (resultado.ok) {
    const { error: errorGuardar } = await servicio.rpc("guardar_extraccion_ia", {
      p: {
        registro_id: registro.id,
        proveedor: resultado.proveedor,
        modelo: modelos.get(resultado.proveedor) ?? null,
        fecha_documento: resultado.fecha_documento,
        extracciones: resultado.extracciones,
      } as Json,
    });
    if (errorGuardar) throw new Error(`guardar ${errorGuardar.code ?? "?"}`);
    return;
  }
  if (resultado.clase === "bloqueada") return esperar(servicio, registro.id, resultado.motivo);

  // Fallo real: al tercer intento el registro queda disponible para captura manual (§7).
  const codigo = /^[a-z0-9_.:-]{1,80}$/.test(resultado.motivo) ? resultado.motivo : "error";
  await servicio
    .from("registro")
    .update({
      estado_extraccion: trabajo.intentos >= 3 ? "error" : "en_cola",
      extraccion_nota: codigo,
    })
    .eq("id", registro.id)
    .neq("estado_extraccion", "hecha");
  throw new Error(codigo);
}
