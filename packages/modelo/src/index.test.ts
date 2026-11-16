import { describe, expect, it } from "vitest";
import { origenRegistroSchema, rolSchema } from "./index";

describe("modelo", () => {
  it("acepta los roles de la especificación y rechaza otros", () => {
    expect(rolSchema.parse("auditor")).toBe("auditor");
    expect(rolSchema.safeParse("superusuario").success).toBe(false);
  });

  it("acepta los tres orígenes de registro", () => {
    for (const origen of ["documento", "captura", "importacion"]) {
      expect(origenRegistroSchema.safeParse(origen).success).toBe(true);
    }
  });
});
