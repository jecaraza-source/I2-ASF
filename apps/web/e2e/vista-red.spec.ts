import path from "node:path";
import { expect, test } from "@playwright/test";
import { ingresar, unico } from "./ayuda";

const FIXTURES = path.join(__dirname, "..", "..", "..", "fixtures");

test("vista del 07734: centrar, 2 saltos, atrás del navegador y ficha", async ({ page }) => {
  test.setTimeout(180_000);
  await ingresar(page, "auditor");

  await page.getByRole("link", { name: "Nuevo encargo" }).first().click();
  const nombre = unico("Vista e2e");
  await page.getByLabel("Nombre").fill(nombre);
  await page.getByRole("button", { name: "Crear encargo" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(nombre);

  const modulos = page.getByRole("navigation", { name: "Módulos" });
  await modulos.getByRole("link", { name: "Importación de Excel" }).click();
  await page.getByRole("link", { name: "Nueva importación" }).first().click();
  await page
    .getByLabel(/Archivo de Excel/)
    .setInputFiles(path.join(FIXTURES, "ASF_Auditoria_Forense_07734.xlsx"));
  await page.getByLabel("Fuente").fill("Entrega e2e");
  await page.getByRole("button", { name: "Analizar" }).click();
  await page.getByRole("button", { name: "Confirmar importación" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "ASF_Auditoria_Forense_07734.xlsx",
    { timeout: 60_000 },
  );

  await modulos.getByRole("link", { name: "Red de vínculos" }).click();
  await page.getByRole("button", { name: "Generar red" }).click();
  await expect(page.getByLabel("Indicadores")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("link", { name: "Explorar la red" }).click();

  // La red se dibuja aunque los vínculos del Excel vengan por nombre y no por ID.
  const resumen = page.getByTestId("resumen-vista");
  await expect(resumen).toContainText("relaciones visibles", { timeout: 30_000 });
  const lineas = Number((await resumen.textContent())?.match(/(\d+) relaciones/)?.[1]);
  expect(lineas).toBeGreaterThanOrEqual(22);
  await expect(
    page.getByRole("img", { name: "Red de vínculos" }).locator("canvas").first(),
  ).toBeVisible();

  // Centrar una entidad.
  await page.getByLabel("Buscar entidad").fill("ANA TORRES");
  await page.getByRole("button", { name: "Centrar", exact: true }).click();
  await expect(page).toHaveURL(/foco=[0-9a-f-]{36}&saltos=1/);
  await expect(resumen).toContainText("relaciones directas de la entidad central");
  const ficha = page.getByRole("region", { name: "Ficha" });
  await expect(ficha.getByText("Datos generales")).toBeVisible({ timeout: 30_000 });
  const ruta = page.getByRole("navigation", { name: "Ruta" });
  await expect(ruta.getByRole("button", { name: /ANA TORRES/ })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // Ampliar a 2 saltos; con 300 llamadas la interacción responde de inmediato.
  const unSalto = Number((await resumen.textContent())?.match(/^(\d+) entidades/)?.[1]);
  const inicio = Date.now();
  await page.getByRole("button", { name: "Hasta segundo grado" }).click();
  await expect(resumen).toContainText("hasta segundo grado de la entidad central");
  expect(Date.now() - inicio).toBeLessThan(3_000);
  await expect(page).toHaveURL(/saltos=2/);
  const dosSaltos = Number((await resumen.textContent())?.match(/^(\d+) entidades/)?.[1]);
  expect(dosSaltos).toBeGreaterThanOrEqual(unSalto);

  // Atrás del navegador: 1 salto y luego la vista general.
  await page.goBack();
  await expect(page).toHaveURL(/saltos=1/);
  await expect(resumen).toContainText("relaciones directas de la entidad central");
  await page.goBack();
  await expect(page).not.toHaveURL(/foco=/);
  await expect(resumen).not.toContainText("de la entidad central");
  await expect(ruta.getByRole("button", { name: "Vista general" })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // Ficha completa, con enlace al registro y a la celda de origen.
  await page.getByLabel("Buscar entidad").fill("ANA TORRES");
  await page.getByRole("button", { name: "Centrar", exact: true }).click();
  await ficha.getByRole("link", { name: "Abrir ficha completa" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ANA TORRES");
  await expect(page.getByText("Registros y documentos")).toBeVisible();
  await page
    .getByRole("link", { name: /\[Hoja .*fila/ })
    .first()
    .click();
  await expect(page.getByRole("region", { name: "Datos de origen" })).toContainText("Hoja");
});
