import { describe, expect, it } from "vitest";
import { altaUsuarioSchema } from "./usuarios";

describe("altaUsuarioSchema", () => {
  it("invitación: no pide contraseña y normaliza el correo", () => {
    const r = altaUsuarioSchema.safeParse({
      correo: "  Nuevo@Ejemplo.MX ",
      rol: "auditor",
      modo: "invitacion",
    });
    expect(r.success && r.data.correo).toBe("nuevo@ejemplo.mx");
  });

  it("contraseña temporal: exige al menos 12 caracteres", () => {
    const base = { correo: "a@b.mx", rol: "lector", modo: "temporal" };
    expect(altaUsuarioSchema.safeParse(base).success).toBe(false);
    expect(altaUsuarioSchema.safeParse({ ...base, contrasena: "corta" }).success).toBe(false);
    expect(altaUsuarioSchema.safeParse({ ...base, contrasena: "una-clave-larga-1" }).success).toBe(
      true,
    );
  });

  it("rechaza roles y correos inválidos", () => {
    expect(
      altaUsuarioSchema.safeParse({ correo: "a@b.mx", rol: "jefe", modo: "invitacion" }).success,
    ).toBe(false);
    expect(
      altaUsuarioSchema.safeParse({ correo: "no-es-correo", rol: "lector", modo: "invitacion" })
        .success,
    ).toBe(false);
  });
});
