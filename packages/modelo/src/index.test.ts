import { describe, expect, expectTypeOf, it } from "vitest";
import type { Tables } from "./db";
import {
  alertaSchema,
  calificacionSchema,
  documentoOrigenSchema,
  encargoSchema,
  entidadSchema,
  eventoSchema,
  expedienteSchema,
  extraccionSchema,
  montoSchema,
  registroSchema,
  rolSchema,
  vinculoSchema,
} from "./index";

const id = "a0000000-0000-4000-8000-000000000001";
const base = {
  id,
  organizacion_id: id,
  encargo_id: id,
  creado_en: "2026-11-16T12:00:00+00:00",
  creado_por: null,
};

const registro = {
  ...base,
  expediente_id: null,
  tipo_documento_id: null,
  origen: "captura" as const,
  documento_id: null,
  fuente: "Oficio 123",
  fecha_documento: "2024-03-15",
  estado_validacion: "pendiente" as const,
  estado_extraccion: "no_aplica" as const,
  extraccion_nota: null,
  resumen: null,
};

describe("primitivos", () => {
  it("acepta los roles de la especificación y rechaza otros", () => {
    expect(rolSchema.parse("auditor")).toBe("auditor");
    expect(rolSchema.safeParse("superusuario").success).toBe(false);
  });

  it("conserva el signo de los montos y rechaza formatos ambiguos", () => {
    expect(montoSchema.parse("-1500.50")).toBe("-1500.50");
    expect(montoSchema.parse(-8100000)).toBe(-8100000);
    expect(montoSchema.safeParse("1,500.50").success).toBe(false);
    expect(montoSchema.safeParse("$1500").success).toBe(false);
  });
});

describe("registro", () => {
  it("acepta una captura con fuente declarada", () => {
    expect(registroSchema.safeParse(registro).success).toBe(true);
  });

  it("rechaza una captura sin fuente", () => {
    expect(registroSchema.safeParse({ ...registro, fuente: "  " }).success).toBe(false);
  });

  it("rechaza un registro de documento sin documento", () => {
    expect(registroSchema.safeParse({ ...registro, origen: "documento" }).success).toBe(false);
  });
});

describe("extraccion", () => {
  const extraccion = {
    ...base,
    registro_id: id,
    campo: "monto",
    valor_crudo: "1,000.00",
    valor_normalizado: 1000,
    confianza: null,
    ubicacion: { hoja: "CONTRATOS", fila: 4 },
    metodo: "manual" as const,
    estado: "validado" as const,
    validado_por: id,
    validado_en: "2026-11-16T12:00:00+00:00",
    valor_original: null,
  };

  it("acepta una captura manual sin confianza", () => {
    expect(extraccionSchema.safeParse(extraccion).success).toBe(true);
  });

  it("rechaza confianza en una captura manual", () => {
    expect(extraccionSchema.safeParse({ ...extraccion, confianza: 0.9 }).success).toBe(false);
  });

  it("acepta una lectura de la IA reemplazada por otra", () => {
    expect(
      extraccionSchema.safeParse({
        ...extraccion,
        metodo: "ia",
        confianza: 0.9,
        estado: "reemplazado",
      }).success,
    ).toBe(true);
  });

  it("rechaza confianza fuera de 0–1", () => {
    expect(
      extraccionSchema.safeParse({ ...extraccion, metodo: "ia", confianza: 1.2 }).success,
    ).toBe(false);
  });
});

describe("otras entidades", () => {
  it("documento_origen exige SHA-256 hexadecimal", () => {
    const doc = {
      ...base,
      expediente_id: null,
      sha256: "a".repeat(64),
      storage_path: `${id}/${id}/${"a".repeat(64)}`,
      nombre_archivo: "contrato.pdf",
      mime: "application/pdf",
      tamano: 1024,
      folio: null,
      fuente: null,
      recibido_por: null,
      recibido_en: base.creado_en,
      original_id: null,
    };
    expect(documentoOrigenSchema.safeParse(doc).success).toBe(true);
    expect(documentoOrigenSchema.safeParse({ ...doc, sha256: "XYZ" }).success).toBe(false);
  });

  it("vinculo limita la fuerza a 1–10", () => {
    const v = {
      ...base,
      origen_id: id,
      destino_id: id,
      tipo: "socio",
      fuerza: 9,
      fuerza_original: "CRÍTICO",
      fecha_inicio: null,
      dirigido: false,
      monto: "25000.00",
      moneda: "MXN",
      participacion: 0.25,
      registro_id: id,
    };
    expect(vinculoSchema.safeParse(v).success).toBe(true);
    expect(vinculoSchema.safeParse({ ...v, participacion: 1.5 }).success).toBe(false);
    expect(vinculoSchema.safeParse({ ...v, fuerza: 11 }).success).toBe(false);
  });

  it("evento con monto exige moneda", () => {
    const e = {
      ...base,
      tipo: "transferencia" as const,
      fecha_hora: null,
      monto: "138500000.00",
      moneda: "MXN",
      atributos: {},
    };
    expect(eventoSchema.safeParse(e).success).toBe(true);
    expect(eventoSchema.safeParse({ ...e, moneda: null }).success).toBe(false);
  });

  it("calificación ajustada exige motivo", () => {
    const c = {
      ...base,
      red_id: id,
      objeto_tipo: "entidad" as const,
      objeto_id: id,
      puntaje: 40,
      nivel: "medio" as const,
      criterios: [],
      ajuste_nivel: "alto" as const,
      ajuste_motivo: null,
      ajustado_por: id,
    };
    expect(calificacionSchema.safeParse(c).success).toBe(false);
    expect(calificacionSchema.safeParse({ ...c, ajuste_motivo: "Revisión" }).success).toBe(true);
  });
});

describe("los esquemas cubren las columnas de la base", () => {
  // Si una migración agrega o quita columnas, estas comprobaciones de tipo fallan
  // en `pnpm typecheck` hasta actualizar el esquema zod.
  type Llaves<T> = keyof T;
  it("coinciden con db.ts", () => {
    expectTypeOf<Llaves<Tables<"encargo">>>().toEqualTypeOf<
      Llaves<ReturnType<typeof encargoSchema.parse>>
    >();
    expectTypeOf<Llaves<Tables<"expediente">>>().toEqualTypeOf<
      Llaves<ReturnType<typeof expedienteSchema.parse>>
    >();
    expectTypeOf<Llaves<Tables<"documento_origen">>>().toEqualTypeOf<
      Llaves<ReturnType<typeof documentoOrigenSchema.parse>>
    >();
    expectTypeOf<Llaves<Tables<"registro">>>().toEqualTypeOf<
      Llaves<ReturnType<typeof registroSchema.parse>>
    >();
    expectTypeOf<Llaves<Tables<"extraccion">>>().toEqualTypeOf<
      Llaves<ReturnType<typeof extraccionSchema.parse>>
    >();
    expectTypeOf<Llaves<Tables<"entidad">>>().toEqualTypeOf<
      Llaves<ReturnType<typeof entidadSchema.parse>>
    >();
    expectTypeOf<Llaves<Tables<"vinculo">>>().toEqualTypeOf<
      Llaves<ReturnType<typeof vinculoSchema.parse>>
    >();
    expectTypeOf<Llaves<Tables<"evento">>>().toEqualTypeOf<
      Llaves<ReturnType<typeof eventoSchema.parse>>
    >();
    expectTypeOf<Llaves<Tables<"alerta">>>().toEqualTypeOf<
      Llaves<ReturnType<typeof alertaSchema.parse>>
    >();
    expectTypeOf<Llaves<Tables<"calificacion">>>().toEqualTypeOf<
      Llaves<ReturnType<typeof calificacionSchema.parse>>
    >();
  });
});
