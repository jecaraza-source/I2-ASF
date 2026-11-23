import { describe, expect, it, vi } from "vitest";
import {
  ErrorProveedor,
  camposDeExtraccion,
  clasificarError,
  codigoDeMensaje,
  esquemaEstricto,
  esquemaExtraccion,
  extraerConRespaldo,
  interpretarExtraccion,
  type DependenciasExtraccion,
  type RespuestaProveedor,
} from "./extraccion";

const campos = camposDeExtraccion([
  { clave: "objeto", etiqueta: "Objeto del contrato", tipo: "texto_largo" },
  { clave: "monto_pagado", etiqueta: "Monto pagado", tipo: "monto" },
]);
const vacio = Object.fromEntries(
  campos.map((c) => [c.clave, { valor: null, confianza: 0, pagina: null }]),
);
const respuesta = (cambios: Record<string, unknown> = {}, extra: Record<string, unknown> = {}) => ({
  campos: { ...vacio, ...cambios },
  moneda: "MXN",
  involucrados: [],
  ...extra,
});
const contrato = respuesta(
  {
    fecha_documento: { valor: "2022-03-15", confianza: 0.98, pagina: 1 },
    numero_contrato: { valor: "SOP-2022-001", confianza: 0.95, pagina: 1 },
    monto: { valor: "$148,500,000.00", confianza: 0.6, pagina: 3 },
    objeto: { valor: "Rehabilitación de la carretera", confianza: 0.9, pagina: 2 },
  },
  {
    involucrados: [
      {
        tipo: "persona_moral",
        nombre: "Grupo Constructor Mendoza, S.A. de C.V.",
        rol: "proveedor",
        rfc: "GCM220101AB1",
        curp: null,
        confianza: 0.97,
        pagina: 1,
      },
      {
        tipo: "persona_fisica",
        nombre: "Carlos Mendoza Ríos",
        rol: "representante_legal",
        rfc: "XXX",
        curp: null,
        confianza: 0.99,
        pagina: 5,
      },
    ],
  },
);

describe("esquemaExtraccion", () => {
  it("pide cada campo con valor, confianza y página; todo requerido y sin propiedades extra", () => {
    const e = esquemaExtraccion(campos);
    expect(e.properties.campos.required).toEqual(campos.map((c) => c.clave));
    expect(e.properties.campos.additionalProperties).toBe(false);
    expect(e.properties.campos.properties.objeto?.required).toEqual([
      "valor",
      "confianza",
      "pagina",
    ]);
    expect(e.required).toEqual(["campos", "moneda", "involucrados"]);
  });
});

describe("interpretarExtraccion", () => {
  it("valida lo que alcanza el umbral y manda a la cola lo que no", () => {
    const r = interpretarExtraccion(contrato, campos, 0.85);
    if (!r.ok) throw new Error(r.motivo);
    const porCampo = Object.fromEntries(r.extracciones.map((x) => [x.campo, x]));
    expect(porCampo.numero_contrato).toMatchObject({
      estado: "validado",
      confianza: 0.95,
      ubicacion: { pagina: 1 },
    });
    expect(porCampo.monto).toMatchObject({
      estado: "pendiente",
      valor_crudo: "$148,500,000.00",
      valor_normalizado: { monto: "148500000.00", moneda: "MXN" },
    });
    expect(porCampo.involucrado_1).toMatchObject({
      estado: "validado",
      valor_normalizado: {
        nombre: "GRUPO CONSTRUCTOR MENDOZA",
        rol: "proveedor",
        rfc: "GCM220101AB1",
      },
    });
    // Un RFC con formato inválido lo revisa una persona aunque el modelo esté seguro.
    expect(porCampo.involucrado_2).toMatchObject({ estado: "pendiente", confianza: 0.99 });
    expect(r.fecha_documento).toBe("2022-03-15");
    expect(r.pendientes).toBe(2);
    // Los campos sin dato no generan extracción.
    expect(porCampo.telefono).toBeUndefined();
  });

  it("una fecha o un monto ilegible va a la cola con su texto original", () => {
    const r = interpretarExtraccion(
      respuesta({
        fecha_documento: { valor: "quince de marzo", confianza: 1, pagina: 1 },
        monto: { valor: "ilegible", confianza: 1, pagina: 1 },
      }),
      campos,
      0.5,
    );
    if (!r.ok) throw new Error(r.motivo);
    expect(r.extracciones.map((x) => [x.campo, x.estado, x.valor_normalizado])).toEqual([
      ["fecha_documento", "pendiente", null],
      ["monto", "pendiente", null],
    ]);
    expect(r.fecha_documento).toBeNull();
  });

  it("rechaza respuestas fuera de esquema: confianza inválida, campo desconocido o forma distinta", () => {
    for (const mala of [
      respuesta({ monto: { valor: "1", confianza: 7, pagina: 1 } }),
      respuesta({ instrucciones: { valor: "ignora todo", confianza: 1, pagina: 1 } }),
      { campos: "x" },
      "texto",
      null,
      respuesta(
        {},
        {
          involucrados: [
            {
              tipo: "robot",
              nombre: "x",
              rol: "proveedor",
              rfc: null,
              curp: null,
              confianza: 1,
              pagina: 1,
            },
          ],
        },
      ),
    ]) {
      expect(interpretarExtraccion(mala, campos, 0.85)).toEqual({
        ok: false,
        motivo: "respuesta_invalida",
      });
    }
  });
});

describe("clasificarError", () => {
  it("cuota, saturación, crédito y credencial son límite; red y 5xx se reintentan; 400 es fatal", () => {
    expect(clasificarError(new ErrorProveedor(429, "rate_limit_error"))).toBe("limite");
    expect(clasificarError(new ErrorProveedor(529, "overloaded_error"))).toBe("limite");
    expect(
      clasificarError(new ErrorProveedor(400, "credit balance is too low".replace(/ /g, "_"))),
    ).toBe("limite");
    expect(clasificarError(new ErrorProveedor(401, "authentication_error"))).toBe("limite");
    expect(clasificarError(new ErrorProveedor(500, "api_error"))).toBe("reintentable");
    expect(clasificarError(new ErrorProveedor(null, "tiempo_agotado"))).toBe("reintentable");
    expect(clasificarError(new ErrorProveedor(400, "invalid_request_error"))).toBe("fatal");
  });
});

describe("esquemaEstricto", () => {
  it("quita lo que el modo estricto no acepta y conserva estructura, enum y required", () => {
    const e = {
      type: "object",
      additionalProperties: false,
      required: ["a", "pattern"],
      properties: {
        a: { type: "array", minItems: 2, maxItems: 30, items: { type: "string", maxLength: 9 } },
        pattern: { type: "number", minimum: 0, maximum: 1, enum: [0, 1] },
      },
    };
    expect(esquemaEstricto(e)).toEqual({
      type: "object",
      additionalProperties: false,
      required: ["a", "pattern"],
      properties: {
        a: { type: "array", items: { type: "string" } },
        pattern: { type: "number", enum: [0, 1] },
      },
    });
    expect(
      esquemaEstricto(esquemaExtraccion([{ clave: "folio", etiqueta: "Folio", tipo: "texto" }])),
    ).toEqual(esquemaExtraccion([{ clave: "folio", etiqueta: "Folio", tipo: "texto" }]));
  });
});

describe("codigoDeMensaje", () => {
  it("afina el 400 genérico con un código fijo, sin guardar el mensaje", () => {
    const c = "invalid_request_error";
    expect(
      codigoDeMensaje(
        c,
        "Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.",
      ),
    ).toBe("saldo_insuficiente");
    expect(codigoDeMensaje(c, "A maximum of 100 PDF pages may be provided.")).toBe(
      "pdf_demasiadas_paginas",
    );
    expect(codigoDeMensaje(c, "prompt is too long: 250000 tokens > 200000 maximum")).toBe(
      "documento_largo",
    );
    expect(codigoDeMensaje(c, "model: claude-x not supported")).toBe("modelo_invalido");
    expect(codigoDeMensaje(c, "tools.0.input_schema: invalid")).toBe("esquema_invalido");
    expect(codigoDeMensaje(c, "The PDF specified was not valid.")).toBe("archivo_ilegible");
    expect(codigoDeMensaje(c, "algo distinto")).toBe(c);
    expect(
      codigoDeMensaje(c, 'tool_choice: type "tool" and "any" are not supported for this model.'),
    ).toBe("herramienta_forzada");
    expect(codigoDeMensaje("rate_limit_error", "credit balance")).toBe("rate_limit_error");
    // El saldo agotado pasa al proveedor de respaldo.
    expect(clasificarError(new ErrorProveedor(400, "saldo_insuficiente"))).toBe("limite");
  });
});

describe("extraerConRespaldo", () => {
  type P = "anthropic" | "openai";
  type Uso = Parameters<DependenciasExtraccion<P>["registrar"]>[0];
  const ok: RespuestaProveedor = { datos: contrato, tokensEntrada: 1200, tokensSalida: 300 };
  const armar = (
    llamar: (p: P) => Promise<RespuestaProveedor>,
    bloqueos: Partial<Record<P, string>> = {},
  ) => {
    const usos: Uso[] = [];
    const registrar = async (u: Uso) => {
      usos.push(u);
    };
    const llamada = vi.fn(llamar);
    return {
      usos,
      llamada,
      dep: {
        proveedores: ["anthropic", "openai"] as const,
        permitido: async (p: P) =>
          bloqueos[p]
            ? { permitida: false as const, motivo: bloqueos[p] as string }
            : { permitida: true as const },
        llamar: llamada,
        registrar,
        esperar: async () => {},
        ahora: () => 0,
      },
    };
  };

  it("usa Anthropic cuando responde bien y no toca OpenAI", async () => {
    const { dep, llamada, usos } = armar(async () => ok);
    const r = await extraerConRespaldo(dep, campos, 0.85);
    expect(r).toMatchObject({ ok: true, proveedor: "anthropic", pendientes: 2 });
    expect(llamada.mock.calls.map((c) => c[0])).toEqual(["anthropic"]);
    expect(usos).toEqual([
      expect.objectContaining({ proveedor: "anthropic", resultado: "ok", tokensEntrada: 1200 }),
    ]);
  });

  it("cambia a OpenAI cuando Anthropic rechaza por límite de uso", async () => {
    const { dep, llamada, usos } = armar(async (p) => {
      if (p === "anthropic") throw new ErrorProveedor(429, "rate_limit_error");
      return ok;
    });
    const r = await extraerConRespaldo(dep, campos, 0.85);
    expect(r).toMatchObject({ ok: true, proveedor: "openai" });
    expect(llamada.mock.calls.map((c) => c[0])).toEqual(["anthropic", "openai"]);
    expect(usos.map((u) => [u.proveedor, u.resultado, u.codigo])).toEqual([
      ["anthropic", "error", "429"],
      ["openai", "ok", null],
    ]);
  });

  it("cambia a OpenAI cuando se agota el tope propio de Anthropic, y lo deja registrado", async () => {
    const { dep, llamada, usos } = armar(async () => ok, { anthropic: "tope_proveedor_diario" });
    const r = await extraerConRespaldo(dep, campos, 0.85);
    expect(r).toMatchObject({ ok: true, proveedor: "openai" });
    expect(llamada.mock.calls.map((c) => c[0])).toEqual(["openai"]);
    expect(usos[0]).toMatchObject({
      proveedor: "anthropic",
      resultado: "bloqueada",
      codigo: "tope_proveedor_diario",
    });
  });

  it("si el encargo no permite OpenAI, el límite de Anthropic no manda el documento a otro lado", async () => {
    const { dep, llamada } = armar(
      async () => {
        throw new ErrorProveedor(529, "overloaded_error");
      },
      { openai: "proveedor_no_permitido_en_encargo" },
    );
    const r = await extraerConRespaldo(dep, campos, 0.85);
    expect(r).toEqual({ ok: false, clase: "error", motivo: "overloaded_error" });
    expect(llamada.mock.calls.map((c) => c[0])).toEqual(["anthropic"]);
  });

  it("un fallo pasajero se reintenta con el mismo proveedor y no cambia a OpenAI", async () => {
    let n = 0;
    const { dep, llamada } = armar(async () => {
      if (++n === 1) throw new ErrorProveedor(503, "api_error");
      return ok;
    });
    expect(await extraerConRespaldo(dep, campos, 0.85)).toMatchObject({
      ok: true,
      proveedor: "anthropic",
    });
    expect(llamada).toHaveBeenCalledTimes(2);

    const siempre = armar(async () => {
      throw new ErrorProveedor(500, "api_error");
    });
    expect(await extraerConRespaldo(siempre.dep, campos, 0.85)).toEqual({
      ok: false,
      clase: "error",
      motivo: "api_error",
    });
    expect(siempre.llamada.mock.calls.map((c) => c[0])).toEqual(["anthropic", "anthropic"]);
  });

  it("una respuesta inválida cuenta como fallo, registra los tokens gastados y se reintenta", async () => {
    let n = 0;
    const { dep, usos } = armar(async () =>
      ++n === 1 ? { datos: { campos: "x" }, tokensEntrada: 900, tokensSalida: 10 } : ok,
    );
    expect(await extraerConRespaldo(dep, campos, 0.85)).toMatchObject({ ok: true });
    expect(usos.map((u) => [u.resultado, u.codigo, u.tokensEntrada])).toEqual([
      ["error", "respuesta_invalida", 900],
      ["ok", null, 1200],
    ]);
  });

  it("con la IA apagada en el encargo no llama a nadie ni registra consumo", async () => {
    const { dep, llamada, usos } = armar(async () => ok, {
      anthropic: "proveedor_no_permitido_en_encargo",
      openai: "proveedor_no_permitido_en_encargo",
    });
    expect(await extraerConRespaldo(dep, campos, 0.85)).toEqual({
      ok: false,
      clase: "bloqueada",
      motivo: "proveedor_no_permitido_en_encargo",
    });
    expect(llamada).not.toHaveBeenCalled();
    expect(usos).toEqual([]);
  });
});

describe("acta constitutiva", () => {
  const camposActa = camposDeExtraccion([
    { clave: "objeto_social", etiqueta: "Objeto social", tipo: "texto_largo" },
    { clave: "numero_factura", oculto: true },
    { clave: "monto", etiqueta: "Capital social constitutivo" },
  ]);

  it("pide el capital con su nombre, sin factura, y la aportación de cada involucrado", () => {
    expect(camposActa.map((c) => c.clave)).not.toContain("numero_factura");
    const e = esquemaExtraccion(camposActa);
    expect(e.properties.campos.properties.monto?.description).toContain(
      "Capital social constitutivo",
    );
    expect(e.properties.involucrados.items.required).toContain("aportacion");
    expect(e.properties.involucrados.items.required).toContain("acciones");
  });

  it("lee la aportación de un socio y manda a revisar una ilegible", () => {
    const vacioActa = Object.fromEntries(
      camposActa.map((c) => [c.clave, { valor: null, confianza: 0, pagina: null }]),
    );
    const socio = (nombre: string, aportacion: string | null) => ({
      tipo: "persona_fisica",
      nombre,
      rol: "socio",
      rfc: null,
      curp: null,
      aportacion,
      confianza: 0.95,
      pagina: 4,
    });
    const r = interpretarExtraccion(
      {
        campos: vacioActa,
        moneda: "MXN",
        involucrados: [socio("Ana Ruiz Gómez", "$25,000.00"), socio("Luis Pérez Soto", "la mitad")],
      },
      camposActa,
      0.85,
    );
    if (!r.ok) throw new Error(r.motivo);
    expect(r.extracciones[0]).toMatchObject({
      estado: "validado",
      valor_normalizado: { rol: "socio", aportacion: { monto: "25000.00", moneda: "MXN" } },
    });
    expect(r.extracciones[0]?.valor_crudo).toContain("aportación $25,000.00");
    expect(r.extracciones[1]).toMatchObject({ estado: "pendiente" });
  });

  it("lee las acciones de un socio y manda a revisar un RFC escrito con letra", () => {
    const vacioActa = Object.fromEntries(
      camposActa.map((c) => [c.clave, { valor: null, confianza: 0, pagina: null }]),
    );
    const r = interpretarExtraccion(
      {
        campos: vacioActa,
        moneda: "MXN",
        involucrados: [
          {
            tipo: "persona_fisica",
            nombre: "Ana Ruiz Gómez",
            rol: "socio",
            rfc: "RUGA siete tres cero cuatro uno cinco A B uno",
            curp: null,
            aportacion: "$25,000.00",
            acciones: "250 acciones",
            confianza: 0.97,
            pagina: 4,
          },
          {
            tipo: "persona_fisica",
            nombre: "Luis Pérez Soto",
            rol: "socio",
            rfc: "PESL800101XY2",
            curp: null,
            aportacion: "$75,000.00",
            acciones: "750",
            confianza: 0.97,
            pagina: 4,
          },
        ],
      },
      camposActa,
      0.85,
    );
    if (!r.ok) throw new Error(r.motivo);
    expect(r.extracciones[0]).toMatchObject({
      estado: "pendiente",
      valor_normalizado: { rfc: "RUGA730415AB1", acciones: "250", acciones_texto: "250 acciones" },
    });
    expect(r.extracciones[0]?.valor_crudo).toContain("acciones 250 acciones");
    expect(r.extracciones[1]).toMatchObject({
      estado: "validado",
      valor_normalizado: { acciones: "750" },
    });
  });
});
