import { describe, expect, it } from "vitest";
import { PAQUETE } from "./index";

describe("red", () => {
  it("expone su nombre", () => {
    expect(PAQUETE).toBe("red");
  });
});
