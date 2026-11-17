/**
 * Lista 69-B del SAT (§11.1): lectura del CSV o Excel que publica el SAT. Funciones puras: corren
 * en el navegador (lectura) y en el servidor (validación de cada fila antes de guardarla).
 *
 * El archivo del SAT trae líneas de título antes del encabezado, viene a veces en Windows-1252 y
 * sus columnas cambian de nombre entre publicaciones: se busca la fila de encabezado (la que tiene
 * «RFC» y «Situación») y las columnas por nombre, no por posición.
 */
import { z } from "zod";
import { esRfc, normalizarNombre, sinAcentos, type Celda } from "./normalizacion";

export const SITUACIONES_69B = [
  "presunto",
  "desvirtuado",
  "definitivo",
  "sentencia_favorable",
  "otro",
] as const;
export type Situacion69b = (typeof SITUACIONES_69B)[number];
export const NOMBRE_SITUACION_69B: Record<Situacion69b, string> = {
  presunto: "Presunto",
  desvirtuado: "Desvirtuado",
  definitivo: "Definitivo",
  sentencia_favorable: "Sentencia favorable",
  otro: "Otra situación",
};

/** Más que esto no es la lista del SAT (hoy ronda las 15,000 filas). */
export const MAX_FILAS_69B = 200_000;
const MAX_DATOS = 20;

export const fila69bSchema = z.object({
  rfc: z
    .string()
    .trim()
    .toUpperCase()
    .refine(esRfc, "RFC inválido")
    .transform((r) => r.replace(/[\s-]/g, "")),
  nombre: z.string().trim().min(1).max(300),
  nombre_normalizado: z.string().trim().min(1).max(300),
  situacion: z.enum(SITUACIONES_69B),
  datos: z
    .record(z.string().max(120), z.string().max(300))
    .refine((d) => Object.keys(d).length <= MAX_DATOS),
});
export type Fila69b = z.infer<typeof fila69bSchema>;

/** UTF-8 si lo es; si no, Windows-1252 (como suele publicar el SAT). */
export function decodificarTexto(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** CSV (RFC 4180): comillas, comillas dobles escapadas, saltos dentro de comillas. */
export function tablaDeCsv(texto: string): string[][] {
  const primera = texto.split(/\r?\n/, 1)[0] ?? "";
  const separador =
    (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ";" : ",";
  const filas: string[][] = [];
  let fila: string[] = [];
  let celda = "";
  let enComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (enComillas) {
      if (c === '"' && texto[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') enComillas = false;
      else celda += c;
    } else if (c === '"') enComillas = true;
    else if (c === separador) {
      fila.push(celda);
      celda = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && texto[i + 1] === "\n") i++;
      fila.push(celda);
      filas.push(fila);
      fila = [];
      celda = "";
    } else celda += c;
  }
  if (celda !== "" || fila.length) {
    fila.push(celda);
    filas.push(fila);
  }
  return filas;
}

const plano = (c: Celda | undefined) =>
  sinAcentos(c instanceof Date ? c.toISOString().slice(0, 10) : String(c ?? ""))
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();

export function situacionDe(texto: string): Situacion69b {
  const t = plano(texto);
  if (t.includes("SENTENCIA")) return "sentencia_favorable";
  if (t.includes("DESVIRTU")) return "desvirtuado";
  if (t.includes("DEFINITIV")) return "definitivo";
  if (t.includes("PRESUNT")) return "presunto";
  return "otro";
}

export type Lectura69b =
  | {
      ok: true;
      filas: Fila69b[];
      /** Filas sin RFC válido o sin nombre: se informan, no se cargan. */
      descartadas: { fila: number; motivo: string }[];
      repetidas: number;
    }
  | { ok: false; motivo: string };

/** Interpreta la tabla (de un CSV o de una hoja de Excel). `fila` en descartadas es base 1. */
export function leerLista69b(tabla: readonly (readonly Celda[])[]): Lectura69b {
  const inicio = tabla.findIndex(
    (f) => f.some((c) => plano(c) === "RFC") && f.some((c) => plano(c).startsWith("SITUACION")),
  );
  if (inicio < 0) {
    return {
      ok: false,
      motivo:
        "No se encontró el encabezado con las columnas «RFC» y «Situación del contribuyente».",
    };
  }
  const encabezado = (tabla[inicio] ?? []).map((c) => String(c ?? "").trim());
  const col = (prueba: (h: string) => boolean) => encabezado.findIndex((h) => prueba(plano(h)));
  const iRfc = col((h) => h === "RFC");
  const iSituacion = col((h) => h.startsWith("SITUACION"));
  const iNombre = col(
    (h) => h.includes("NOMBRE") || h.includes("RAZON SOCIAL") || h.includes("CONTRIBUYENTE"),
  );
  if (iNombre < 0)
    return { ok: false, motivo: "No se encontró la columna del nombre del contribuyente." };
  const otras = encabezado
    .map((h, i) => ({ h, i }))
    .filter(
      ({ h, i }) =>
        h && ![iRfc, iSituacion, iNombre].includes(i) && plano(h) !== "NO" && plano(h) !== "NO.",
    )
    .slice(0, MAX_DATOS);

  const filas: Fila69b[] = [];
  const descartadas: { fila: number; motivo: string }[] = [];
  const vistos = new Set<string>();
  let repetidas = 0;
  for (let n = inicio + 1; n < tabla.length; n++) {
    const f = tabla[n] ?? [];
    if (f.every((c) => String(c ?? "").trim() === "")) continue;
    if (filas.length + descartadas.length >= MAX_FILAS_69B) {
      return {
        ok: false,
        motivo: `El archivo excede ${MAX_FILAS_69B.toLocaleString("es-MX")} filas.`,
      };
    }
    const nombre = String(f[iNombre] ?? "")
      .replace(/\s+/g, " ")
      .trim();
    const datos: Record<string, string> = {};
    for (const { h, i } of otras) {
      const v = f[i];
      const texto = v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? "").trim();
      if (texto) datos[h.slice(0, 120)] = texto.slice(0, 300);
    }
    const r = fila69bSchema.safeParse({
      rfc: String(f[iRfc] ?? ""),
      nombre: nombre.slice(0, 300),
      nombre_normalizado:
        normalizarNombre(nombre).slice(0, 300) || nombre.toUpperCase().slice(0, 300),
      situacion: situacionDe(String(f[iSituacion] ?? "")),
      datos,
    });
    if (!r.success) {
      descartadas.push({ fila: n + 1, motivo: r.error.issues[0]?.message ?? "Fila inválida" });
      continue;
    }
    if (vistos.has(r.data.rfc)) {
      repetidas++;
      continue;
    }
    vistos.add(r.data.rfc);
    filas.push(r.data);
  }
  if (!filas.length) return { ok: false, motivo: "El archivo no tiene filas con RFC válido." };
  return { ok: true, filas, descartadas, repetidas };
}
