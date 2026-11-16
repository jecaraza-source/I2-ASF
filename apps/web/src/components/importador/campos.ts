/**
 * Campos que pide la pantalla de mapeo por clase de hoja. Coinciden con
 * `plantillaSchema` de @sigma/importador (que valida en el servidor).
 */
import type { ClaseHoja } from "@sigma/importador";

export type CampoMapeo = { clave: string; etiqueta: string; requerido?: boolean };

export const CLASES: { valor: ClaseHoja | "ignorar"; texto: string }[] = [
  { valor: "ignorar", texto: "No importar" },
  { valor: "contratos", texto: "Contratos" },
  { valor: "transferencias", texto: "Movimientos financieros" },
  { valor: "vinculos", texto: "Vínculos entre entidades" },
  { valor: "llamadas", texto: "Registro de llamadas" },
  { valor: "entidades", texto: "Catálogo de entidades" },
  { valor: "cifras", texto: "Cifras declaradas (portada o resumen)" },
];

export const CAMPOS: Record<Exclude<ClaseHoja, "cifras">, CampoMapeo[]> = {
  contratos: [
    { clave: "identificador", etiqueta: "Identificador de fila (folio o número)", requerido: true },
    { clave: "numero", etiqueta: "Número de contrato" },
    { clave: "proveedor", etiqueta: "Proveedor", requerido: true },
    { clave: "rfc", etiqueta: "RFC del proveedor" },
    { clave: "dependencia", etiqueta: "Dependencia" },
    { clave: "fecha", etiqueta: "Fecha de firma" },
    { clave: "monto_original", etiqueta: "Monto original" },
    { clave: "monto_pagado", etiqueta: "Monto pagado" },
  ],
  transferencias: [
    { clave: "identificador", etiqueta: "Folio" },
    { clave: "fecha", etiqueta: "Fecha", requerido: true },
    { clave: "origen", etiqueta: "Nombre del origen", requerido: true },
    { clave: "origen_id", etiqueta: "ID del origen (en el archivo)" },
    { clave: "destino", etiqueta: "Nombre del destino", requerido: true },
    { clave: "destino_id", etiqueta: "ID del destino (en el archivo)" },
    { clave: "cuenta_origen", etiqueta: "Cuenta origen" },
    { clave: "cuenta_destino", etiqueta: "Cuenta destino" },
    { clave: "tipo", etiqueta: "Tipo de operación" },
    { clave: "etapa", etiqueta: "Etapa o alerta" },
    { clave: "monto_mxn", etiqueta: "Monto en MXN", requerido: true },
    { clave: "monto_usd", etiqueta: "Monto en USD (si hay)" },
  ],
  vinculos: [
    { clave: "origen", etiqueta: "Entidad A", requerido: true },
    { clave: "tipo_origen", etiqueta: "Tipo de la entidad A" },
    { clave: "destino", etiqueta: "Entidad B", requerido: true },
    { clave: "tipo_destino", etiqueta: "Tipo de la entidad B" },
    { clave: "tipo_vinculo", etiqueta: "Tipo de vínculo" },
    { clave: "fuerza", etiqueta: "Fuerza o peso" },
    { clave: "fecha", etiqueta: "Fecha" },
  ],
  llamadas: [
    { clave: "numero_origen", etiqueta: "Número A", requerido: true },
    { clave: "numero_destino", etiqueta: "Número B", requerido: true },
    { clave: "fecha", etiqueta: "Fecha", requerido: true },
    { clave: "hora", etiqueta: "Hora" },
    { clave: "duracion", etiqueta: "Duración (segundos)" },
    { clave: "tipo", etiqueta: "Tipo de evento" },
    { clave: "nombre_origen", etiqueta: "Nombre A" },
    { clave: "nombre_destino", etiqueta: "Nombre B" },
  ],
  entidades: [
    { clave: "id", etiqueta: "ID en el archivo" },
    { clave: "nombre", etiqueta: "Nombre o razón social", requerido: true },
    { clave: "tipo", etiqueta: "Tipo" },
    { clave: "id_fiscal", etiqueta: "RFC o ID fiscal" },
    { clave: "riesgo", etiqueta: "Riesgo declarado" },
  ],
};
