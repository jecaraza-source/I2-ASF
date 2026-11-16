/**
 * Convierte un resultado de importación en la carga que recibe la función
 * `importar_excel` de la base (supabase/migrations/…_importacion.sql).
 */
import type { ResultadoImportacion } from "./importar";

export type DocumentoCarga = {
  sha256: string;
  storage_path: string;
  nombre_archivo: string;
  mime: string;
  tamano: number;
};

export type CargaImportacion = {
  organizacion_id: string;
  encargo_id: string;
  expediente_id: string | null;
  fuente: string | null;
  plantilla: string;
  documento: DocumentoCarga;
  hojas: {
    hoja: string;
    estado: string;
    filas_validas: number;
    excluidas: number;
    cifras: number;
  }[];
  registros: ResultadoImportacion["registros"];
  entidades: ResultadoImportacion["entidades"];
  vinculos: ResultadoImportacion["vinculos"];
  eventos: ResultadoImportacion["eventos"];
};

export function construirCarga(
  r: ResultadoImportacion,
  destino: {
    organizacionId: string;
    encargoId: string;
    expedienteId: string | null;
    fuente: string | null;
    documento: DocumentoCarga;
  },
): CargaImportacion {
  return {
    organizacion_id: destino.organizacionId,
    encargo_id: destino.encargoId,
    expediente_id: destino.expedienteId,
    fuente: destino.fuente,
    plantilla: r.plantilla,
    documento: destino.documento,
    hojas: r.hojas.map((h) => ({
      hoja: h.hoja,
      estado: h.estado,
      filas_validas: h.filas_validas,
      excluidas: h.excluidas.length,
      cifras: h.cifras,
    })),
    registros: r.registros,
    entidades: r.entidades,
    vinculos: r.vinculos,
    eventos: r.eventos,
  };
}

/** Ruta del original en el bucket (§4): {organizacion}/{encargo}/{sha256}. */
export function rutaOriginal(organizacionId: string, encargoId: string, sha256: string): string {
  return `${organizacionId}/${encargoId}/${sha256}`;
}
