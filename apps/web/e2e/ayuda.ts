import { expect, type Page } from "@playwright/test";

export const CONTRASENA = "sigma-local-123";
export const USUARIOS = {
  admin: "admin@sigma.test",
  auditor: "auditor@sigma.test",
  lector: "lector@sigma.test",
} as const;

export async function ingresar(page: Page, rol: keyof typeof USUARIOS) {
  await page.goto("/ingresar");
  await page.getByLabel("Correo").fill(USUARIOS[rol]);
  await page.getByLabel("Contraseña").fill(CONTRASENA);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/encargos$/);
}

/** Sufijo único por ejecución para no chocar con datos de otras corridas. */
export function unico(prefijo: string): string {
  return `${prefijo} ${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}
