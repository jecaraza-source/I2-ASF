import { describe, expect, it } from "vitest";
import { PAQUETE } from "./index";

describe("importador", () => {
  it("expone su nombre", () => {
    expect(PAQUETE).toBe("importador");
  });
});
