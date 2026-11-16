import { expect, test } from "@playwright/test";
import { CONTRASENA, USUARIOS } from "./ayuda";

test("sin sesión, todo redirige a /ingresar con la marca de la plataforma", async ({ page }) => {
  await page.goto("/encargos");
  await expect(page).toHaveURL(/\/ingresar\?siguiente=%2Fencargos$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Plataforma SIGMA");
  await expect(page.getByRole("img", { name: "Logo SIGMA" })).toBeVisible();
});

test("una contraseña incorrecta muestra un error genérico", async ({ page }) => {
  await page.goto("/ingresar");
  await page.getByLabel("Correo").fill(USUARIOS.auditor);
  await page.getByLabel("Contraseña").fill(`${CONTRASENA}-mal`);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page.getByRole("alert")).toHaveText("Correo o contraseña incorrectos.");
  await expect(page).toHaveURL(/\/ingresar/);
});

test("tras ingresar regresa a la ruta pedida", async ({ page }) => {
  await page.goto("/encargos/nuevo");
  await page.getByLabel("Correo").fill(USUARIOS.auditor);
  await page.getByLabel("Contraseña").fill(CONTRASENA);
  await page.getByRole("button", { name: "Ingresar" }).click();
  await expect(page).toHaveURL(/\/encargos\/nuevo$/);
});
