"use client";

import { HORAS_MAXIMAS_SIN_ENVIAR, type CedulaCampo } from "@sigma/modelo";
import { z } from "zod";

/**
 * Lo que la app de campo guarda en el teléfono (IndexedDB). Dos almacenes:
 * - `estado`: las visitas descargadas. Caducan a las 24 h sin volver a descargarse.
 * - `pendientes`: cédulas con sus fotos que aún no se envían. Se borran al enviarse.
 * Cerrar sesión o «Borrar datos de este teléfono» elimina todo, incluida la caché del service worker.
 */

const BASE = "sigma-campo";
const VERSION = 1;
const MS_MAXIMO = HORAS_MAXIMAS_SIN_ENVIAR * 60 * 60 * 1000;

export const visitaSchema = z.object({
  visita_id: z.uuid(),
  organizacion_id: z.uuid(),
  organizacion: z.string(),
  encargo_id: z.uuid(),
  encargo: z.string(),
  entidad_id: z.uuid(),
  entidad: z.string(),
  entidad_tipo: z.string(),
  rfc: z.string().nullable(),
  nivel: z.string().nullable(),
  domicilios: z.array(z.string()).nullable(),
  documentos: z
    .array(
      z.object({
        registro_id: z.string(),
        tipo: z.string().nullable().optional(),
        fecha: z.string().nullable().optional(),
        resumen: z.string().nullable().optional(),
        monto: z.unknown().optional(),
      }),
    )
    .catch([]),
  instrucciones: z.string().nullable(),
  aviso_aceptado: z.boolean(),
});
export type VisitaLocal = z.infer<typeof visitaSchema>;

export const respuestaVisitasSchema = z.object({
  usuario_id: z.uuid(),
  visitas: z.array(visitaSchema),
});

export type FotoLocal = {
  id: string;
  blob: Blob;
  sha256: string;
  mime: string;
  bytes: number;
  capturada_en: string;
  latitud: number | null;
  longitud: number | null;
  precision_m: number | null;
  /** Ya está en el bucket y registrada por el servidor. */
  registrada: boolean;
};

export type PendienteLocal = {
  cedula: CedulaCampo;
  organizacion_id: string;
  encargo_id: string;
  entidad: string;
  fotos: FotoLocal[];
  guardada_en: string;
  error: string | null;
};

type EstadoLocal = { usuario_id: string; descargado_en: string; visitas: VisitaLocal[] };

function abrir(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(BASE, VERSION);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains("estado")) db.createObjectStore("estado");
      if (!db.objectStoreNames.contains("pendientes")) db.createObjectStore("pendientes");
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error("IndexedDB no disponible"));
  });
}

async function operar<T>(
  almacen: "estado" | "pendientes",
  modo: IDBTransactionMode,
  fn: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await abrir();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(almacen, modo);
      const req = fn(tx.objectStore(almacen));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? new Error("Error de IndexedDB"));
      tx.onabort = () => reject(tx.error ?? new Error("Operación cancelada"));
    });
  } finally {
    db.close();
  }
}

export function caducado(fechaIso: string, ahora = Date.now()): boolean {
  return ahora - new Date(fechaIso).getTime() > MS_MAXIMO;
}

/** Visitas guardadas; si caducaron, se borran y devuelve null. */
export async function leerVisitas(): Promise<EstadoLocal | null> {
  const e = await operar<EstadoLocal | undefined>("estado", "readonly", (s) => s.get("visitas"));
  if (!e) return null;
  if (caducado(e.descargado_en)) {
    await operar("estado", "readwrite", (s) => s.delete("visitas"));
    return null;
  }
  return e;
}

export async function guardarVisitas(usuarioId: string, visitas: VisitaLocal[]): Promise<void> {
  const previo = await operar<EstadoLocal | undefined>("estado", "readonly", (s) =>
    s.get("visitas"),
  );
  // Otro usuario en el mismo teléfono: no hereda nada del anterior.
  if (previo && previo.usuario_id !== usuarioId) await borrarTodo();
  const valor: EstadoLocal = {
    usuario_id: usuarioId,
    descargado_en: new Date().toISOString(),
    visitas,
  };
  await operar("estado", "readwrite", (s) => s.put(valor, "visitas"));
}

export async function leerPendientes(): Promise<PendienteLocal[]> {
  const todos = await operar<PendienteLocal[]>("pendientes", "readonly", (s) => s.getAll());
  return todos.sort((a, b) => a.guardada_en.localeCompare(b.guardada_en));
}

export async function guardarPendiente(p: PendienteLocal): Promise<void> {
  await operar("pendientes", "readwrite", (s) => s.put(p, p.cedula.id));
}

export async function quitarPendiente(id: string): Promise<void> {
  await operar("pendientes", "readwrite", (s) => s.delete(id));
}

/** Borra todo lo de la app en este teléfono: visitas, cédulas sin enviar y caché sin conexión. */
export async function borrarTodo(): Promise<void> {
  await Promise.all([
    operar("estado", "readwrite", (s) => s.clear()),
    operar("pendientes", "readwrite", (s) => s.clear()),
  ]);
  if ("caches" in globalThis) {
    const claves = await caches.keys();
    await Promise.all(
      claves.filter((c) => c.startsWith("sigma-campo")).map((c) => caches.delete(c)),
    );
  }
}

export async function huellaSha256(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type Ubicacion = { latitud: number; longitud: number; precision_m: number };

/** Ubicación actual; null si el teléfono no la da en 15 s o el usuario la niega. */
export function ubicacionActual(): Promise<Ubicacion | null> {
  if (!("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitud: pos.coords.latitude,
          longitud: pos.coords.longitude,
          precision_m: Math.round(pos.coords.accuracy),
        }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  });
}
