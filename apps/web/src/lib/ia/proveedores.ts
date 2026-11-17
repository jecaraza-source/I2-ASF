import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { ErrorProveedor, type RespuestaProveedor } from "@sigma/importador/extraccion";
import type { ProveedorIA } from "@sigma/modelo";
import OpenAI from "openai";

/** Tipos de archivo que los proveedores leen directamente. */
export type MimeLegible = "application/pdf" | "image/png" | "image/jpeg" | "image/webp";
export const MIMES_LEGIBLES: readonly string[] = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];
/** El archivo viaja en base64 dentro de la petición (límite conservador de 32 MB por petición). */
export const MAX_BYTES_LECTURA = 20 * 1024 * 1024;

const TIEMPO_LIMITE_MS = 120_000;
const MAX_TOKENS_SALIDA = 8000;
const HERRAMIENTA = "registrar_extraccion";

export type PeticionExtraccion = {
  modelo: string;
  sistema: string;
  instruccion: string;
  esquema: Record<string, unknown>;
  archivo: { bytes: Uint8Array; mime: MimeLegible; nombre: string };
};

/**
 * IA simulada para pruebas: nunca en producción. Con `IA_SIMULADA=1` ningún proveedor real recibe
 * nada; la respuesta sale de una línea `%SIGMA_IA_SIMULADA {json}` dentro del archivo de prueba.
 */
export function iaSimulada(): boolean {
  return process.env.IA_SIMULADA === "1" && process.env.VERCEL_ENV !== "production";
}

/** Traduce el error de un SDK a un código corto. Nunca copia el mensaje (puede citar el documento). */
function errorDe(e: unknown): ErrorProveedor {
  if (e instanceof ErrorProveedor) return e;
  const x = e as { status?: unknown; name?: unknown; error?: unknown; code?: unknown };
  const status = typeof x?.status === "number" ? x.status : null;
  const cuerpo = (x?.error ?? {}) as { type?: unknown; code?: unknown; error?: { type?: unknown } };
  const tipo = [cuerpo.error?.type, cuerpo.type, cuerpo.code, x?.code].find(
    (v) => typeof v === "string",
  );
  if (typeof tipo === "string" && /^[a-z0-9_.-]{1,60}$/i.test(tipo)) {
    return new ErrorProveedor(status, tipo.toLowerCase());
  }
  const nombre = typeof x?.name === "string" ? x.name : "";
  if (/timeout|abort/i.test(nombre)) return new ErrorProveedor(status, "tiempo_agotado");
  if (/connection/i.test(nombre)) return new ErrorProveedor(status, "red");
  return new ErrorProveedor(status, status ? `http_${status}` : "error");
}

async function llamarAnthropic(p: PeticionExtraccion): Promise<RespuestaProveedor> {
  const cliente = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    maxRetries: 0,
    timeout: TIEMPO_LIMITE_MS,
  });
  const base64 = Buffer.from(p.archivo.bytes).toString("base64");
  // PDF → bloque `document`; imágenes → bloque `image` (docs: build-with-claude/pdf-support).
  const adjunto =
    p.archivo.mime === "application/pdf"
      ? ({
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: base64 },
        } as const)
      : ({
          type: "image",
          source: { type: "base64", media_type: p.archivo.mime, data: base64 },
        } as const);
  const r = await cliente.messages.create({
    model: p.modelo,
    max_tokens: MAX_TOKENS_SALIDA,
    system: p.sistema,
    tools: [
      {
        name: HERRAMIENTA,
        description: "Registra los datos extraídos del documento.",
        input_schema: p.esquema as Anthropic.Tool.InputSchema,
      },
    ],
    tool_choice: { type: "tool", name: HERRAMIENTA },
    messages: [{ role: "user", content: [adjunto, { type: "text", text: p.instruccion }] }],
  });
  const uso = r.content.find((b) => b.type === "tool_use");
  const tokens = { tokensEntrada: r.usage.input_tokens, tokensSalida: r.usage.output_tokens };
  // Respuesta cortada o sin herramienta: se devuelve vacía para que cuente como inválida.
  if (!uso || r.stop_reason === "max_tokens") return { datos: null, ...tokens };
  return { datos: uso.input, ...tokens };
}

async function llamarOpenAI(p: PeticionExtraccion): Promise<RespuestaProveedor> {
  const cliente = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
    maxRetries: 0,
    timeout: TIEMPO_LIMITE_MS,
  });
  const dataUrl = `data:${p.archivo.mime};base64,${Buffer.from(p.archivo.bytes).toString("base64")}`;
  // PDF → `input_file` con `file_data`; imágenes → `input_image` (docs: guides/file-inputs).
  const adjunto =
    p.archivo.mime === "application/pdf"
      ? ({ type: "input_file", filename: "documento.pdf", file_data: dataUrl } as const)
      : ({ type: "input_image", image_url: dataUrl, detail: "high" } as const);
  const r = await cliente.responses.create({
    model: p.modelo,
    instructions: p.sistema,
    max_output_tokens: MAX_TOKENS_SALIDA,
    store: false,
    input: [{ role: "user", content: [adjunto, { type: "input_text", text: p.instruccion }] }],
    text: { format: { type: "json_schema", name: HERRAMIENTA, schema: p.esquema, strict: true } },
  });
  const tokens = {
    tokensEntrada: r.usage?.input_tokens ?? 0,
    tokensSalida: r.usage?.output_tokens ?? 0,
  };
  try {
    return { datos: JSON.parse(r.output_text), ...tokens };
  } catch {
    return { datos: null, ...tokens };
  }
}

const MARCA = "%SIGMA_IA_SIMULADA ";

/** Respuesta de prueba leída del propio archivo. Permite simular fallos por proveedor. */
function llamarSimulada(proveedor: ProveedorIA, p: PeticionExtraccion): RespuestaProveedor {
  const texto = Buffer.from(p.archivo.bytes).toString("latin1");
  const linea = texto.split(/\r?\n/).find((l) => l.startsWith(MARCA));
  let guion: Record<string, unknown> = {};
  try {
    guion = linea
      ? (JSON.parse(Buffer.from(linea.slice(MARCA.length), "latin1").toString("utf8")) as Record<
          string,
          unknown
        >)
      : {};
  } catch {
    guion = {};
  }
  const fallo = (guion.fallar as Record<string, number> | undefined)?.[proveedor];
  if (typeof fallo === "number") throw new ErrorProveedor(fallo, `simulado_${fallo}`);
  const esquema = p.esquema as { properties?: { campos?: { required?: string[] } } };
  const dados = (guion.campos ?? {}) as Record<string, unknown>;
  const campos = Object.fromEntries(
    (esquema.properties?.campos?.required ?? []).map((k) => [
      k,
      dados[k] ?? { valor: null, confianza: 0, pagina: null },
    ]),
  );
  return {
    datos: guion.invalida
      ? { campos: "inválida" }
      : { campos, moneda: guion.moneda ?? "MXN", involucrados: guion.involucrados ?? [] },
    tokensEntrada: Math.ceil(p.archivo.bytes.length / 4) + 500,
    tokensSalida: 200,
  };
}

/** Llama al proveedor. Lanza `ErrorProveedor` con un código corto si falla. */
export async function llamarProveedor(
  proveedor: ProveedorIA,
  p: PeticionExtraccion,
): Promise<RespuestaProveedor> {
  try {
    if (iaSimulada()) return llamarSimulada(proveedor, p);
    return proveedor === "anthropic" ? await llamarAnthropic(p) : await llamarOpenAI(p);
  } catch (e) {
    throw errorDe(e);
  }
}
