import { describe, expect, it } from "vitest";
import { PAQUETE } from "./index";

describe("reglas", () => {
  it("expone su nombre", () => {
    expect(PAQUETE).toBe("reglas");
  });
});
