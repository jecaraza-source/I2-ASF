import path from "node:path";
import { expect, test } from "@playwright/test";
import { ingresar, unico } from "./ayuda";

const FIXTURES = path.join(__dirname, "..", "..", "..", "fixtures");

test("auditor importa el expediente 07734 y ve 12 contratos, 14 movimientos y 300 llamadas", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await ingresar(page, "auditor");

  // Encargo nuevo para que la prueba sea repetible (el hash es único por encargo).
  await page.getByRole("link", { name: "Nuevo encargo" }).first().click();
  const nombre = unico("Importación e2e");
  await page.getByLabel("Nombre").fill(nombre);
  await page.getByRole("button", { name: "Crear encargo" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(nombre);

  await page
    .getByRole("navigation", { name: "Módulos" })
    .getByRole("link", { name: "Importación de Excel" })
    .click();
  await expect(page.getByText("Aún no hay importaciones.")).toBeVisible();
  await page.getByRole("link", { name: "Nueva importación" }).first().click();

  await page
    .getByLabel(/Archivo de Excel/)
    .setInputFiles(path.join(FIXTURES, "ASF_Auditoria_Forense_07734.xlsx"));
  await page.getByLabel("Fuente").fill("Entrega ASF e2e");
  await page.getByRole("button", { name: "Analizar" }).click();

  // Vista previa: plantilla detectada, conteos y filas excluidas con motivo.
  await expect(page.getByTestId("plantilla")).toHaveText(
    "Plantilla detectada: ASF_Auditoria_Forense",
  );
  await expect(page.getByLabel("Conteos")).toContainText("Contratos12");
  await expect(page.getByLabel("Conteos")).toContainText("Movimientos14");
  await expect(page.getByLabel("Conteos")).toContainText("Llamadas300");
  await expect(page.getByRole("cell", { name: "Fila 16: fila de totales" })).toBeVisible();

  await page.getByRole("button", { name: "Confirmar importación" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "ASF_Auditoria_Forense_07734.xlsx",
    {
      timeout: 60_000,
    },
  );
  await expect(page.getByTestId("conteo-Contratos")).toContainText("12");
  await expect(page.getByTestId("conteo-Movimientos")).toContainText("14");
  await expect(page.getByTestId("conteo-Llamadas")).toContainText("300");
  await expect(page.getByTestId("conteo-Vínculos")).toContainText("22");

  // Aparece en la lista y el mismo archivo ya no se puede volver a cargar.
  await page.getByRole("link", { name: "Todas las importaciones" }).click();
  await expect(page.getByRole("link", { name: "ASF_Auditoria_Forense_07734.xlsx" })).toBeVisible();
  await page.getByRole("link", { name: "Nueva importación" }).first().click();
  await page
    .getByLabel(/Archivo de Excel/)
    .setInputFiles(path.join(FIXTURES, "ASF_Auditoria_Forense_07734.xlsx"));
  await page.getByRole("button", { name: "Analizar" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "ya se importó" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Confirmar importación" })).toBeDisabled();
});

test("lector ve las importaciones pero no puede importar", async ({ page }) => {
  await ingresar(page, "lector");
  await page.getByRole("link", { name: "Encargo de prueba" }).click();
  await page
    .getByRole("navigation", { name: "Módulos" })
    .getByRole("link", { name: "Importación de Excel" })
    .click();
  await expect(page.getByRole("link", { name: "Nueva importación" })).toHaveCount(0);
});
