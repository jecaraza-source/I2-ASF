import { expect, test } from "@playwright/test";
import { ingresar, unico } from "./ayuda";

test("administrador de IA: estado, topes, precios y proveedores por encargo", async ({ page }) => {
  test.setTimeout(120_000);
  await ingresar(page, "admin");

  // Un encargo nuevo nace con la IA apagada.
  await page.getByRole("link", { name: "Nuevo encargo" }).first().click();
  const encargo = unico("IA e2e");
  await page.getByLabel("Nombre").fill(encargo);
  await page.getByRole("button", { name: "Crear encargo" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(encargo);

  await page.getByRole("link", { name: "Uso de IA" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Uso de IA");
  await expect(page.getByTestId("ia-hoy")).toContainText("tokens");
  await expect(page.getByRole("region", { name: "Proveedores" })).toContainText(
    "ANTHROPIC_API_KEY",
  );
  await expect(page.getByRole("region", { name: "Proveedores" })).toContainText("OPENAI_API_KEY");
  const anthropic = page.getByLabel(`Anthropic (Claude) en ${encargo}`);
  const openai = page.getByLabel(`OpenAI (ChatGPT) en ${encargo}`);
  await expect(anthropic).not.toBeChecked();
  await expect(openai).not.toBeChecked();

  // Permitir un proveedor en el encargo.
  await anthropic.check();
  await page.getByRole("button", { name: `Guardar IA de ${encargo}` }).click();
  await expect(page.getByText("pueden enviarse a los proveedores marcados")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel(`Anthropic (Claude) en ${encargo}`)).toBeChecked();
  await expect(page.getByLabel(`OpenAI (ChatGPT) en ${encargo}`)).not.toBeChecked();

  // Topes: el mensual no puede ser menor que el diario.
  await page.getByLabel("Tope diario de tokens").fill("5,000,000");
  await page.getByLabel("Tope mensual de tokens").fill("1000");
  await page.getByRole("button", { name: "Guardar configuración" }).click();
  await expect(page.getByText("El tope mensual no puede ser menor que el diario.")).toBeVisible();
  await page.getByLabel("Tope mensual de tokens").fill("60000000");
  await page.getByRole("button", { name: "Guardar configuración" }).click();
  await expect(page.getByText("Configuración guardada.")).toBeVisible();
  await expect(page.getByTestId("ia-hoy")).toContainText("5,000,000");

  // Precio para estimar el costo.
  const modelo = `modelo-e2e-${Date.now().toString(36)}`;
  await page.getByLabel("Modelo", { exact: true }).fill(modelo);
  await page.getByLabel("USD por millón (entrada)").fill("3");
  await page.getByLabel("USD por millón (salida)").fill("15");
  await page.getByRole("button", { name: "Guardar precio" }).click();
  await expect(page.getByRole("list", { name: "Precios" })).toContainText(modelo);
  await page.getByRole("button", { name: `Quitar precio de ${modelo}` }).click();
  await expect(page.getByText(modelo)).toHaveCount(0);

  // El mismo control está en la configuración del encargo.
  await page.getByRole("link", { name: encargo }).click();
  await page
    .getByRole("navigation", { name: "Módulos" })
    .getByRole("link", { name: "Configuración" })
    .click();
  await expect(page.getByLabel(`Anthropic (Claude) en ${encargo}`)).toBeChecked();
});

test("auditor no ve ni controla el uso de IA", async ({ page }) => {
  await ingresar(page, "auditor");
  await expect(page.getByRole("link", { name: "Uso de IA" })).toHaveCount(0);
  await page.goto("/ia");
  await expect(
    page.getByText("Solo los administradores de la organización ven y controlan el uso de IA."),
  ).toBeVisible();
  await expect(page.getByLabel("Tope diario de tokens")).toHaveCount(0);
});
