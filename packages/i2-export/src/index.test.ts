import { describe, expect, it } from "vitest";
import { PAQUETE } from "./index";

describe("i2-export", () => {
  it("expone su nombre", () => {
    expect(PAQUETE).toBe("i2-export");
  });
});
