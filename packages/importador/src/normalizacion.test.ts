import { describe, expect, it } from "vitest";
import {
  agregarIdentificador,
  claveDesdeTexto,
  esClabe,
  fechaHoraLocal,
  montosEnTexto,
  normalizarEntero,
  normalizarFecha,
  normalizarFuerza,
  normalizarHora,
  normalizarMonto,
  normalizarNombre,
  primerNumero,
  referenciaA1,
  sumarMontos,
} from "./normalizacion";

describe("normalizarMonto", () => {
  it("conserva signo y paréntesis contables", () => {
    expect(normalizarMonto(-11500000)).toBe("-11500000.00");
    expect(normalizarMonto("(1,500.50)")).toBe("-1500.50");
    expect(normalizarMonto("-$2,000")).toBe("-2000.00");
    expect(normalizarMonto("$1,947,320,450")).toBe("1947320450.00");
    expect(normalizarMonto("1234.567")).toBe("1234.57");
  });

  it("no inventa montos a partir de texto que no lo es", () => {
    expect(normalizarMonto("ASF-2023-001")).toBeNull();
    expect(normalizarMonto("[Fórmula]")).toBeNull();
    expect(normalizarMonto("12-34")).toBeNull();
    expect(normalizarMonto("")).toBeNull();
  });

  it("suma exacta en centavos", () => {
    expect(sumarMontos(["0.10", "0.20", null, "-0.05"])).toBe("0.25");
    expect(sumarMontos(["4500000.00", "1800000.00"])).toBe("6300000.00");
  });
});

describe("cifras en texto", () => {
  it("reconoce montos y millones", () => {
    expect(montosEnTexto("por un monto total de $1,847,320,450.00 MXN. Se")).toEqual([
      { crudo: "$1,847,320,450.00", valor: "1847320450.00" },
    ]);
    expect(montosEnTexto("por $38.5 MDP y $116.5M")).toEqual([
      { crudo: "$38.5 MDP", valor: "38500000.00" },
      { crudo: "$116.5M", valor: "116500000.00" },
    ]);
  });

  it("primer número de un valor declarado", () => {
    expect(primerNumero("9 (75%)")).toBe("9.00");
    expect(primerNumero("14 operaciones")).toBe("14.00");
  });
});

describe("fechas y horas", () => {
  it("dd/mm/aaaa es formato mexicano", () => {
    expect(normalizarFecha("15/03/2022")).toBe("2022-03-15");
    expect(normalizarFecha("31/02/2022")).toBeNull();
  });

  it("convierte seriales de Excel y fechas", () => {
    expect(normalizarFecha(44635)).toBe("2022-03-15");
    expect(normalizarFecha(new Date("2022-03-15T00:00:00Z"))).toBe("2022-03-15");
  });

  it("horas y fracciones de día", () => {
    expect(normalizarHora("7:05:13")).toBe("07:05:13");
    expect(normalizarHora(0.5)).toBe("12:00:00");
    expect(normalizarHora("25:00")).toBeNull();
  });

  it("respeta el horario de verano histórico de la Ciudad de México", () => {
    expect(fechaHoraLocal("2022-01-26", "15:15:14")).toBe("2022-01-26T15:15:14-06:00");
    expect(fechaHoraLocal("2022-07-10", "20:25:01")).toBe("2022-07-10T20:25:01-05:00");
    expect(fechaHoraLocal("2023-07-10", "20:25:01")).toBe("2023-07-10T20:25:01-06:00");
  });
});

describe("normalizarNombre", () => {
  it("mayúsculas, sin acentos ni sufijos societarios", () => {
    expect(normalizarNombre("Constructora Zeta S.A. de C.V.")).toBe("CONSTRUCTORA ZETA");
    expect(normalizarNombre("GRUPO CONSTRUCTOR MENDOZA SA")).toBe("GRUPO CONSTRUCTOR MENDOZA");
    expect(normalizarNombre("CONSULTORÍA  DELTA SOLUTIONS SC")).toBe("CONSULTORIA DELTA SOLUTIONS");
    expect(normalizarNombre("INFRAESTRUCTURA OMEGA CORP")).toBe("INFRAESTRUCTURA OMEGA");
    expect(normalizarNombre("GLOBAL HOLDINGS DELTA LTD")).toBe("GLOBAL HOLDINGS DELTA");
  });

  it("no recorta palabras que solo terminan igual que un sufijo", () => {
    expect(normalizarNombre("FONATURA")).toBe("FONATURA");
    expect(normalizarNombre("MESA")).toBe("MESA");
  });
});

describe("fuerza", () => {
  it("escala 1–10", () => {
    expect(normalizarFuerza("CRÍTICO")).toBe(9);
    expect(normalizarFuerza("ALTO")).toBe(7);
    expect(normalizarFuerza("MEDIO")).toBe(5);
    expect(normalizarFuerza("BAJO")).toBe(3);
    expect(normalizarFuerza("10")).toBe(10);
    expect(normalizarFuerza(11)).toBeNull();
  });
});

describe("identificadores", () => {
  it("valida RFC y marca los inválidos sin descartarlos", () => {
    expect(agregarIdentificador({}, "rfc", "GCM220101ABC")).toEqual({ rfc: "GCM220101ABC" });
    expect(agregarIdentificador({}, "rfc", "XX-1")).toEqual({ rfc: "XX1", invalidos: ["rfc"] });
  });

  it("id_fiscal acepta identificadores extranjeros", () => {
    expect(agregarIdentificador({}, "id_fiscal", "INC-BVI-4432")).toEqual({
      id_fiscal: "INC-BVI-4432",
    });
    expect(agregarIdentificador({}, "id_fiscal", "DEFA801212HJK")).toEqual({
      rfc: "DEFA801212HJK",
    });
  });

  it("CLABE con dígito verificador", () => {
    expect(esClabe("002010077777777771")).toBe(true);
    expect(esClabe("002010077777777772")).toBe(false);
  });

  it("referencias A1", () => {
    expect(referenciaA1(16, 8)).toBe("H16");
    expect(referenciaA1(1, 27)).toBe("AA1");
  });
});

describe("claves escritas con letra", () => {
  it("convierte los dígitos en palabra de un RFC notarial", () => {
    expect(claveDesdeTexto("SESV siete, tres, cero, cuatro, uno, cinco, A, B, uno")).toBe(
      "SESV730415AB1",
    );
    expect(claveDesdeTexto("R.F.C.: ABC-nueve-ocho-cero-uno-cero-uno-guion-X Y Z")).toBe(
      "ABC980101XYZ",
    );
    expect(claveDesdeTexto("Siete, TRES")).toBe("73");
  });

  it("deja igual una clave que ya trae números", () => {
    expect(claveDesdeTexto("SESV-730415-AB1")).toBe("SESV730415AB1");
    expect(claveDesdeTexto("RFC SESV730415AB1")).toBe("SESV730415AB1");
  });

  it("agregarIdentificador valida la clave ya convertida", () => {
    const ids = agregarIdentificador({}, "rfc", "SESV siete tres cero cuatro uno cinco A B uno");
    expect(ids.rfc).toBe("SESV730415AB1");
    expect(ids.invalidos).toBeUndefined();
    const curp = agregarIdentificador(
      {},
      "curp",
      "SESV siete tres cero cuatro uno cinco H D F R R S cero nueve",
    );
    expect(curp.curp).toBe("SESV730415HDFRRS09");
    expect(curp.invalidos).toBeUndefined();
  });
});

describe("normalizarEntero", () => {
  it("toma el número de acciones", () => {
    expect(normalizarEntero("500")).toBe("500");
    expect(normalizarEntero("1,500 acciones")).toBe("1500");
    expect(normalizarEntero("quinientas (500) acciones")).toBe("500");
    expect(normalizarEntero("2.500")).toBe("2500");
    expect(normalizarEntero("quinientas")).toBeNull();
  });
});
