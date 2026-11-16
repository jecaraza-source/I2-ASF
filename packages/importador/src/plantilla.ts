/**
 * Plantillas de importación (docs/ESPECIFICACION.md §8). Mapeo explícito: cada
 * hoja declara qué produce y qué columna (por encabezado) alimenta cada dato.
 * Nada se adivina. Las plantillas son datos (tabla plantilla_importacion).
 */
import { z } from "zod";

const columna = z.string().trim().min(1);
const filaEncabezado = z.number().int().min(1).max(50);

export const claseHojaSchema = z.enum([
  "contratos",
  "vinculos",
  "transferencias",
  "llamadas",
  "entidades",
  "cifras",
]);
export type ClaseHoja = z.infer<typeof claseHojaSchema>;

const hojaContratos = z.object({
  hoja: z.string().min(1),
  clase: z.literal("contratos"),
  fila_encabezado: filaEncabezado,
  columnas: z.object({
    identificador: columna,
    numero: columna.optional(),
    proveedor: columna,
    rfc: columna.optional(),
    dependencia: columna.optional(),
    fecha: columna.optional(),
    monto_original: columna.optional(),
    monto_pagado: columna.optional(),
  }),
  moneda: z
    .string()
    .regex(/^[A-Z]{3}$/)
    .default("MXN"),
});

const hojaVinculos = z.object({
  hoja: z.string().min(1),
  clase: z.literal("vinculos"),
  fila_encabezado: filaEncabezado,
  /** Si los extremos son IDs del archivo (p. ej. N01) en lugar de nombres. */
  extremos_por_id: z.boolean().default(false),
  columnas: z.object({
    origen: columna,
    tipo_origen: columna.optional(),
    destino: columna,
    tipo_destino: columna.optional(),
    tipo_vinculo: columna.optional(),
    fuerza: columna.optional(),
    fecha: columna.optional(),
  }),
});

const montoEnMoneda = z.object({ columna, moneda: z.string().regex(/^[A-Z]{3}$/) });

const hojaTransferencias = z.object({
  hoja: z.string().min(1),
  clase: z.literal("transferencias"),
  fila_encabezado: filaEncabezado,
  columnas: z.object({
    identificador: columna.optional(),
    fecha: columna,
    origen: columna,
    origen_id: columna.optional(),
    destino: columna,
    destino_id: columna.optional(),
    cuenta_origen: columna.optional(),
    cuenta_destino: columna.optional(),
    tipo: columna.optional(),
    etapa: columna.optional(),
  }),
  /** Una o varias columnas de monto; se usa la primera que traiga valor. */
  montos: z.array(montoEnMoneda).min(1),
});

const hojaLlamadas = z.object({
  hoja: z.string().min(1),
  clase: z.literal("llamadas"),
  fila_encabezado: filaEncabezado,
  columnas: z.object({
    numero_origen: columna,
    numero_destino: columna,
    fecha: columna,
    hora: columna.optional(),
    duracion: columna.optional(),
    tipo: columna.optional(),
    nombre_origen: columna.optional(),
    nombre_destino: columna.optional(),
  }),
});

const hojaEntidades = z.object({
  hoja: z.string().min(1),
  clase: z.literal("entidades"),
  fila_encabezado: filaEncabezado,
  columnas: z.object({
    id: columna.optional(),
    nombre: columna,
    tipo: columna.optional(),
    id_fiscal: columna.optional(),
    riesgo: columna.optional(),
  }),
});

const hojaCifras = z.object({
  hoja: z.string().min(1),
  clase: z.literal("cifras"),
});

export const hojaMapeoSchema = z.discriminatedUnion("clase", [
  hojaContratos,
  hojaVinculos,
  hojaTransferencias,
  hojaLlamadas,
  hojaEntidades,
  hojaCifras,
]);
export type HojaMapeo = z.infer<typeof hojaMapeoSchema>;
export type HojaTabla = Exclude<HojaMapeo, { clase: "cifras" }>;

export const firmaHojaSchema = z.object({
  hoja: z.string().min(1),
  encabezados: z.array(z.string().min(1)).default([]),
});

export const plantillaSchema = z.object({
  nombre: z.string().trim().min(1).max(100),
  firma_hojas: z.array(firmaHojaSchema).min(1),
  mapeo: z.object({ hojas: z.array(hojaMapeoSchema).min(1) }),
});
export type Plantilla = z.infer<typeof plantillaSchema>;
export type PlantillaEntrada = z.input<typeof plantillaSchema>;
