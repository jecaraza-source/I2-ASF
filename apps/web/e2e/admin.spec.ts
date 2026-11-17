import { expect, test } from "@playwright/test";
import { ingresar, unico } from "./ayuda";

test("admin agrega una categoría al catálogo de la organización", async ({ page }) => {
  await ingresar(page, "admin");
  await page.getByRole("link", { name: "Encargo de prueba" }).click();
  await page
    .getByRole("navigation", { name: "Módulos" })
    .getByRole("link", { name: "Configuración" })
    .click();

  const categorias = page.getByRole("list", { name: "Categorías documentales" });
  await expect(categorias).toContainText("Contractual");
  await expect(page.getByRole("list", { name: "Tipos de documento" })).toContainText(
    "Convenio modificatorio",
  );

  const nombre = unico("Pericial");
  await page.getByLabel("Nombre de la categoría").fill(nombre);
  await page.getByLabel("Orden").fill("9");
  await page.getByRole("button", { name: "Agregar categoría" }).click();
  await expect(categorias).toContainText(nombre);
});

test("admin agrega un tipo de documento al catálogo", async ({ page }) => {
  await ingresar(page, "admin");
  await page.getByRole("link", { name: "Encargo de prueba" }).click();
  await page
    .getByRole("navigation", { name: "Módulos" })
    .getByRole("link", { name: "Configuración" })
    .click();

  const tipos = page.getByRole("list", { name: "Tipos de documento" });
  await expect(tipos).toContainText("Convenio modificatorio");
  const nombre = unico("Identificación");
  const clave = `id_${Date.now().toString(36)}`;
  await page.getByLabel("Nombre del tipo").fill(nombre);
  await page.getByRole("textbox", { name: /^Clave/ }).fill(clave);
  await page.getByRole("combobox", { name: /^Categoría/ }).selectOption({ label: "Contractual" });
  await page.getByRole("button", { name: "Agregar tipo" }).click();
  await expect(tipos).toContainText(nombre);
  await expect(tipos).toContainText(clave);
});
