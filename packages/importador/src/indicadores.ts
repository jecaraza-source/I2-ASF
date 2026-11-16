/**
 * Indicadores sobre un resultado de importación. Cuentan entidades únicas,
 * nunca filas (CLAUDE.md, convenciones).
 */
import type { EventoImportado, ResultadoImportacion } from "./importar";
import { sinAcentos, sumarMontos } from "./normalizacion";

export function eventosDe(
  r: ResultadoImportacion,
  tipo: EventoImportado["tipo"],
): EventoImportado[] {
  return r.eventos.filter((e) => e.tipo === tipo);
}

export function sumaDe(
  eventos: EventoImportado[],
  campo: "monto" | "monto_pagado" = "monto",
): string {
  return sumarMontos(
    eventos.map((e) =>
      campo === "monto" ? e.monto : ((e.atributos.monto_pagado as string | null) ?? null),
    ),
  );
}

/** Transferencias internacionales (wire transfer) según el tipo de operación declarado. */
export function esWireTransfer(e: EventoImportado): boolean {
  const t = sinAcentos(String(e.atributos.tipo_operacion ?? "")).toUpperCase();
  return /WIRE/.test(t);
}

/** Entidades únicas que aparecen como destino de un vínculo y cuyo tipo declarado cumple el criterio. */
export function destinosUnicosConTipo(r: ResultadoImportacion, patron: RegExp): string[] {
  const porClave = new Map(r.entidades.map((e) => [e.clave, e]));
  const unicos = new Set<string>();
  for (const v of r.vinculos) {
    const e = porClave.get(v.destino);
    const tipos = e?.atributos.tipos_declarados ?? [];
    if (tipos.some((t) => patron.test(sinAcentos(t).toUpperCase()))) unicos.add(v.destino);
  }
  return [...unicos];
}

export type ConteoImportacion = {
  registros: number;
  entidades: number;
  vinculos: number;
  contratos: number;
  transferencias: number;
  llamadas: number;
  cifras: number;
};

export function contar(r: ResultadoImportacion): ConteoImportacion {
  return {
    registros: r.registros.length,
    entidades: r.entidades.length,
    vinculos: r.vinculos.length,
    contratos: eventosDe(r, "contrato").length,
    transferencias: eventosDe(r, "transferencia").length,
    llamadas: eventosDe(r, "llamada").length,
    cifras: r.cifras.length,
  };
}
