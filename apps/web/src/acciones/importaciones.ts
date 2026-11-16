"use server";

import { createHash } from "node:crypto";
import {
  construirCarga,
  contar,
  detectarPlantilla,
  importar,
  plantillaSchema,
  rutaOriginal,
  type ConteoImportacion,
  type Libro,
  type Plantilla,
  type ResumenHoja,
} from "@sigma/importador";
import { leerXlsx } from "@sigma/importador/leer";
import { puede, type Json } from "@sigma/modelo";
import { redirect } from "next/navigation";
import { z } from "zod";
import { mensajeDeError } from "@/lib/errores-db";
import { requerirOrganizacion } from "@/lib/sesion";
import { clienteServidor } from "@/lib/supabase/servidor";

const MAX_BYTES = 4 * 1024 * 1024;
const MIME_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const FILAS_MUESTRA = 12;

export type MuestraHoja = { hoja: string; filas: string[][] };

export type Analisis = {
  archivo: { nombre: string; tamano: number; sha256: string };
  plantilla: { nombre: string; detectada: boolean; json: string } | null;
  hojas: ResumenHoja[];
  conteo: ConteoImportacion | null;
  muestra: MuestraHoja[];
  duplicado: boolean;
};

export type EstadoAnalisis = { ok: boolean; mensaje?: string; analisis?: Analisis };

type ArchivoLeido = { nombre: string; bytes: Buffer; sha256: string; libro: Libro };

/** Valida y lee el Excel recibido. El hash que cuenta es el que calcula el servidor (§4). */
async function leerArchivo(formData: FormData): Promise<ArchivoLeido | string> {
  const archivo = formData.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return "Elige un archivo de Excel.";
  if (archivo.size > MAX_BYTES) return "El archivo excede 4 MB.";
  if (!/\.xlsx$/i.test(archivo.name)) return "Solo se aceptan archivos .xlsx.";
  const bytes = Buffer.from(await archivo.arrayBuffer());
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  try {
    const libro = await leerXlsx(bytes);
    return { nombre: archivo.name.slice(0, 255), bytes, sha256, libro };
  } catch {
    console.error("[importacion] el archivo no se pudo leer como xlsx");
    return "No se pudo leer el archivo como Excel (.xlsx).";
  }
}

const encargoIdSchema = z.uuid();

async function plantillasDeLaOrganizacion(organizacionId: string): Promise<Plantilla[]> {
  const supabase = await clienteServidor();
  const { data } = await supabase
    .from("plantilla_importacion")
    .select("nombre, firma_hojas, mapeo")
    .eq("organizacion_id", organizacionId);
  return (data ?? []).flatMap((p) => {
    const r = plantillaSchema.safeParse(p);
    return r.success ? [r.data] : [];
  });
}

/** Plantilla enviada desde la pantalla de mapeo (JSON validado con zod) o la detectada. */
async function elegirPlantilla(
  libro: Libro,
  organizacionId: string,
  json: FormDataEntryValue | null,
): Promise<{ plantilla: Plantilla; detectada: boolean } | null | string> {
  if (typeof json === "string" && json.trim()) {
    try {
      const r = plantillaSchema.safeParse(JSON.parse(json));
      if (!r.success) return "El mapeo no es válido. Revisa las columnas elegidas.";
      return { plantilla: r.data, detectada: false };
    } catch {
      return "El mapeo no es válido.";
    }
  }
  const detectada = detectarPlantilla(libro, await plantillasDeLaOrganizacion(organizacionId));
  return detectada ? { plantilla: detectada, detectada: true } : null;
}

function muestraDe(libro: Libro): MuestraHoja[] {
  return libro.hojas.map((h) => ({
    hoja: h.nombre,
    filas: h.filas.slice(0, FILAS_MUESTRA).map((f) =>
      f.map((c) => {
        if (c === null) return "";
        const t = c instanceof Date ? c.toISOString().slice(0, 10) : String(c);
        return t.length > 80 ? `${t.slice(0, 77)}…` : t;
      }),
    ),
  }));
}

export async function analizarExcel(formData: FormData): Promise<EstadoAnalisis> {
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "importacion.crear"))
    return { ok: false, mensaje: "Tu rol no permite importar." };
  const encargoId = encargoIdSchema.safeParse(formData.get("encargo_id"));
  if (!encargoId.success) return { ok: false, mensaje: "Encargo inválido." };

  const leido = await leerArchivo(formData);
  if (typeof leido === "string") return { ok: false, mensaje: leido };

  const supabase = await clienteServidor();
  const { count } = await supabase
    .from("documento_origen")
    .select("id", { count: "exact", head: true })
    .eq("encargo_id", encargoId.data)
    .eq("sha256", leido.sha256);

  const eleccion = await elegirPlantilla(
    leido.libro,
    activa.organizacionId,
    formData.get("plantilla_json"),
  );
  if (typeof eleccion === "string") return { ok: false, mensaje: eleccion };

  const base: Analisis = {
    archivo: { nombre: leido.nombre, tamano: leido.bytes.length, sha256: leido.sha256 },
    plantilla: null,
    hojas: leido.libro.hojas.map((h) => ({
      hoja: h.nombre,
      estado: "no_mapeada",
      filas_validas: 0,
      excluidas: [],
      cifras: 0,
    })),
    conteo: null,
    muestra: muestraDe(leido.libro),
    duplicado: (count ?? 0) > 0,
  };
  if (!eleccion) {
    return {
      ok: true,
      mensaje: "No se reconoció una plantilla. Define el mapeo de columnas.",
      analisis: base,
    };
  }
  const resultado = importar(leido.libro, eleccion.plantilla);
  return {
    ok: true,
    analisis: {
      ...base,
      plantilla: {
        nombre: eleccion.plantilla.nombre,
        detectada: eleccion.detectada,
        json: JSON.stringify(eleccion.plantilla),
      },
      hojas: resultado.hojas,
      conteo: contar(resultado),
    },
  };
}

export async function confirmarImportacion(formData: FormData): Promise<EstadoAnalisis> {
  const { activa } = await requerirOrganizacion();
  if (!puede(activa.rol, "importacion.crear"))
    return { ok: false, mensaje: "Tu rol no permite importar." };
  const encargoId = encargoIdSchema.safeParse(formData.get("encargo_id"));
  if (!encargoId.success) return { ok: false, mensaje: "Encargo inválido." };
  const expedienteCrudo = formData.get("expediente_id");
  const expediente = z
    .uuid()
    .optional()
    .safeParse(expedienteCrudo ? String(expedienteCrudo) : undefined);
  if (!expediente.success) return { ok: false, mensaje: "Expediente inválido." };
  const fuente =
    String(formData.get("fuente") ?? "")
      .trim()
      .slice(0, 200) || null;

  const leido = await leerArchivo(formData);
  if (typeof leido === "string") return { ok: false, mensaje: leido };
  const eleccion = await elegirPlantilla(
    leido.libro,
    activa.organizacionId,
    formData.get("plantilla_json"),
  );
  if (typeof eleccion === "string") return { ok: false, mensaje: eleccion };
  if (!eleccion) return { ok: false, mensaje: "Falta definir el mapeo de columnas." };

  const resultado = importar(leido.libro, eleccion.plantilla);
  if (resultado.registros.length === 0) {
    return { ok: false, mensaje: "El archivo no produjo ningún registro con este mapeo." };
  }

  const supabase = await clienteServidor();

  // El encargo debe ser de la organización activa.
  const { data: encargo } = await supabase
    .from("encargo")
    .select("id")
    .eq("id", encargoId.data)
    .eq("organizacion_id", activa.organizacionId)
    .maybeSingle();
  if (!encargo) return { ok: false, mensaje: "El encargo no existe o no tienes acceso." };

  // Guardar el mapeo como plantilla de la organización (solo admin).
  const nombrePlantilla = String(formData.get("guardar_plantilla") ?? "").trim();
  if (nombrePlantilla && !eleccion.detectada) {
    if (!puede(activa.rol, "plantilla.editar")) {
      return { ok: false, mensaje: "Solo un administrador guarda plantillas." };
    }
    const { error } = await supabase.from("plantilla_importacion").insert({
      organizacion_id: activa.organizacionId,
      nombre: nombrePlantilla.slice(0, 100),
      firma_hojas: eleccion.plantilla.firma_hojas,
      mapeo: eleccion.plantilla.mapeo,
    });
    if (error) {
      return {
        ok: false,
        mensaje:
          error.code === "23505"
            ? "Ya existe una plantilla con ese nombre."
            : mensajeDeError(error, "guardarPlantilla"),
      };
    }
  }

  // Original inmutable en el bucket, direccionado por su hash.
  const ruta = rutaOriginal(activa.organizacionId, encargo.id, leido.sha256);
  const subida = await supabase.storage.from("originales").upload(ruta, leido.bytes, {
    contentType: MIME_XLSX,
    upsert: false,
  });
  if (subida.error && !/exist|duplicate/i.test(subida.error.message)) {
    console.error(`[importacion] no se pudo subir el original del encargo ${encargo.id}`);
    return { ok: false, mensaje: "No se pudo guardar el archivo original. Intenta de nuevo." };
  }

  const carga = construirCarga(resultado, {
    organizacionId: activa.organizacionId,
    encargoId: encargo.id,
    expedienteId: expediente.data ?? null,
    fuente,
    documento: {
      sha256: leido.sha256,
      storage_path: ruta,
      nombre_archivo: leido.nombre,
      mime: MIME_XLSX,
      tamano: leido.bytes.length,
    },
  });
  const { data, error } = await supabase.rpc("importar_excel", {
    p: JSON.parse(JSON.stringify(carga)) as Json,
  });
  if (error) {
    if (error.code === "23505")
      return { ok: false, mensaje: "Este archivo ya se importó en este encargo." };
    return { ok: false, mensaje: mensajeDeError(error, "importarExcel") };
  }
  const documento = z.object({ documento_id: z.uuid() }).safeParse(data);
  if (!documento.success) return { ok: false, mensaje: "La importación no devolvió un documento." };
  redirect(`/encargos/${encargo.id}/importaciones/${documento.data.documento_id}`);
}
