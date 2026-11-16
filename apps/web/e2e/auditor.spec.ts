import { expect, test } from "@playwright/test";
import { ingresar, unico } from "./ayuda";

test("auditor crea un encargo y un expediente y los ve listados", async ({ page }) => {
  await ingresar(page, "auditor");
  await expect(page.getByTestId("rol-activo")).toHaveText("Auditor");
  await expect(page.getByTestId("organizacion-activa")).toHaveText("Organización de prueba");

  // Alta de encargo, con validación en servidor.
  await page.getByRole("link", { name: "Nuevo encargo" }).first().click();
  await page.getByRole("button", { name: "Crear encargo" }).click();
  await expect(page.getByText("El nombre es obligatorio")).toBeVisible();

  const nombre = unico("Auditoría e2e");
  await page.getByLabel("Nombre").fill(nombre);
  await page.getByLabel("Tipo de auditoría").fill("forense");
  await page.getByLabel("Inicio del periodo").fill("2024-01-01");
  await page.getByLabel("Fin del periodo").fill("2024-12-31");
  await page.getByRole("button", { name: "Crear encargo" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText(nombre);
  await expect(page.getByTestId("encargo-activo")).toHaveText(nombre);

  // Aparece en la lista, también al filtrar.
  await page.goto(`/encargos?q=${encodeURIComponent(nombre)}`);
  await expect(page.getByRole("link", { name: nombre })).toBeVisible();

  // Alta de expediente sin identificador: la base genera EXP-AAAA-NNNN.
  await page.getByRole("link", { name: nombre }).click();
  await page
    .getByRole("navigation", { name: "Módulos" })
    .getByRole("link", { name: "Expedientes" })
    .click();
  await expect(page.getByText("Este encargo aún no tiene expedientes.")).toBeVisible();
  await page.getByRole("link", { name: "Nuevo expediente" }).first().click();
  await page.getByLabel("Número de control").fill("ASF-07734");
  await page.getByLabel("Descripción").fill("Contratos de obra 2024");
  await page.getByRole("button", { name: "Crear expediente" }).click();

  const titulo = page.getByRole("heading", { level: 1 });
  await expect(titulo).toHaveText(/^EXP-\d{4}-0001$/);
  const identificador = (await titulo.textContent())?.trim() ?? "";

  await page
    .getByRole("navigation", { name: "Módulos" })
    .getByRole("link", { name: "Expedientes" })
    .click();
  const fila = page.getByRole("row", { name: new RegExp(identificador) });
  await expect(fila).toBeVisible();
  await expect(fila).toContainText("ASF-07734");
});

test("auditor no configura el catálogo", async ({ page }) => {
  await ingresar(page, "auditor");
  await page.getByRole("link", { name: "Encargo de prueba" }).click();
  await page
    .getByRole("navigation", { name: "Módulos" })
    .getByRole("link", { name: "Configuración" })
    .click();
  await expect(page.getByRole("alert")).toContainText("Solo un administrador");
});
