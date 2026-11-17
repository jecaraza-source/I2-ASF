import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { ingresar, unico } from "./ayuda";

const FIXTURES = path.join(__dirname, "..", "..", "..", "fixtures");

async function encargoConImportacion(page: Page, archivo: string) {
  await page.getByRole("link", { name: "Nuevo encargo" }).first().click();
  const nombre = unico("Red e2e");
  await page.getByLabel("Nombre").fill(nombre);
  await page.getByRole("button", { name: "Crear encargo" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(nombre);

  await modulo(page, "Importación de Excel");
  await page.getByRole("link", { name: "Nueva importación" }).first().click();
  await page.getByLabel(/Archivo de Excel/).setInputFiles(path.join(FIXTURES, archivo));
  await page.getByLabel("Fuente").fill("Entrega e2e");
  await page.getByRole("button", { name: "Analizar" }).click();
  await page.getByRole("button", { name: "Confirmar importación" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(archivo, { timeout: 60_000 });
}

async function modulo(page: Page, nombre: string) {
  await page
    .getByRole("navigation", { name: "Módulos" })
    .getByRole("link", { name: nombre })
    .click();
}

async function generarTodas(page: Page) {
  await modulo(page, "Red de vínculos");
  await page.getByRole("button", { name: "Generar red" }).click();
  await expect(page.getByLabel("Indicadores")).toBeVisible({ timeout: 60_000 });
}

test("red de lavado: 20 nodos, 25 vínculos, 20 eventos; un cambio de peso deja diferencias", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await ingresar(page, "admin");
  await encargoConImportacion(page, "Red_Lavado_Dinero_LDN2024047.xlsx");

  await generarTodas(page);
  await expect(page.getByTestId("indicador-Entidades")).toContainText("20");
  await expect(page.getByTestId("indicador-Vínculos declarados")).toContainText("25");
  await expect(page.getByTestId("indicador-Eventos")).toContainText("20");
  // Cada calificación muestra los criterios que la explican.
  const entidades = page.getByRole("region", { name: "Entidades calificadas" });
  await expect(entidades.getByText("Riesgo declarado en la fuente").first()).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Vínculos calificados" })
      .getByText("Fuerza del vínculo")
      .first(),
  ).toBeVisible();

  // Nueva versión de reglas con menos peso para la fuerza del vínculo.
  await modulo(page, "Configuración");
  await page.getByLabel("Multiplicador de la fuerza del vínculo").fill("2");
  await page.getByRole("button", { name: "Guardar nueva versión" }).click();
  await expect(page.getByRole("status").filter({ hasText: "versión" })).toBeVisible();

  await generarTodas(page);
  await expect(page.getByText(/reglas versión [1-9]/)).toBeVisible();
  await expect(page.getByTestId("cambio-Calificaciones que bajaron")).toBeVisible();
  await expect(page.getByRole("list", { name: "Generaciones" }).getByRole("listitem")).toHaveCount(
    2,
  );
});

test("ANALISIS_ASF_EJEMPLO: el indicador fantasma u offshore es 5", async ({ page }) => {
  test.setTimeout(180_000);
  await ingresar(page, "auditor");
  await encargoConImportacion(page, "ANALISIS_ASF_EJEMPLO.xlsx");
  await generarTodas(page);
  await expect(page.getByTestId("indicador-Fantasma u offshore")).toContainText("5");
});

test("lector ve la red pero no puede generarla", async ({ page }) => {
  await ingresar(page, "lector");
  await page.getByRole("link", { name: "Encargo de prueba" }).click();
  await modulo(page, "Red de vínculos");
  await expect(page.getByRole("heading", { name: "Red de vínculos" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Generar red" })).toHaveCount(0);
});
