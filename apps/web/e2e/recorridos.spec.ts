import { expect, test } from "@playwright/test";
import { ingresar, unico } from "./ayuda";

test("recorrido guiado: etapas con avance real, anterior y siguiente, y regreso desde el módulo", async ({
  page,
}) => {
  await ingresar(page, "auditor");
  await page.getByRole("link", { name: "Nuevo encargo" }).first().click();
  const nombre = unico("Recorrido e2e");
  await page.getByLabel("Nombre").fill(nombre);
  await page.getByRole("button", { name: "Crear encargo" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(nombre);

  // El resumen del encargo ofrece los cinco recorridos.
  const tarjetas = page.getByRole("list", { name: "Recorridos guiados" });
  await expect(tarjetas.getByRole("link")).toHaveCount(5);
  await tarjetas.getByRole("link", { name: /Integrar un expediente/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Integrar un expediente");

  // Encargo nuevo: abre en la primera etapa, pendiente.
  const etapas = page.getByRole("list", { name: "Etapas" });
  await expect(etapas.getByRole("link", { name: /Crear el expediente/ })).toHaveAttribute(
    "aria-current",
    "step",
  );
  await expect(page.getByTestId("estado-etapa")).toHaveText(
    "Aún no hay nada de esta etapa en el encargo.",
  );
  await expect(page.getByRole("complementary", { name: "¿Qué sigue?" })).toContainText(
    "1. Crear el expediente (estás aquí)",
  );

  // La etapa lleva al módulo; al crear el expediente y regresar, queda hecha.
  await page.getByRole("link", { name: "Ir a Expedientes" }).click();
  await page.getByRole("link", { name: "Nuevo expediente" }).first().click();
  await page.getByLabel("Número de control").fill("ASF-RECORRIDO");
  await page.getByRole("button", { name: "Crear expediente" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/^EXP-\d{4}-0001$/);
  await page.goto(page.url().replace(/\/expedientes.*$/, "/recorridos/integrar-expediente"));
  await expect(etapas.getByRole("link", { name: /Crear el expediente/ })).toContainText("Hecha");
  // Con la primera cubierta, abre en la siguiente pendiente.
  await expect(etapas.getByRole("link", { name: /Agregar información/ })).toHaveAttribute(
    "aria-current",
    "step",
  );

  // Siguiente y anterior.
  await page.getByRole("link", { name: /Siguiente: Validar/ }).click();
  await expect(page).toHaveURL(/etapa=3/);
  await expect(page.getByRole("link", { name: "Ir a Validación" })).toBeVisible();
  await page.getByRole("link", { name: "← Anterior" }).click();
  await expect(page).toHaveURL(/etapa=2/);
  await expect(page.getByRole("link", { name: "Ingresar documentos" })).toBeVisible();
});

test("menú superior: abre con clic y teclado, muestra descripciones y cierra con Escape", async ({
  page,
}) => {
  await ingresar(page, "auditor");
  await expect(page.getByRole("navigation", { name: "Menú de módulos" })).toHaveCount(0);
  await page.getByRole("link", { name: "Encargo de prueba" }).click();
  const menu = page.getByRole("navigation", { name: "Menú de módulos" });
  const analisis = menu.getByRole("button", { name: /Análisis/ });
  await expect(analisis).toHaveAttribute("aria-expanded", "false");

  await analisis.focus();
  await page.keyboard.press("Enter");
  await expect(analisis).toHaveAttribute("aria-expanded", "true");
  const panel = menu.getByRole("list", { name: "Análisis" });
  await expect(panel.getByRole("link", { name: /Alertas/ })).toContainText(
    "Inconsistencias entre fuentes",
  );
  await expect(panel.getByRole("link", { name: /^Analizador/ })).toBeVisible();
  await expect(panel.getByRole("link", { name: /^Hallazgos/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(analisis).toHaveAttribute("aria-expanded", "false");
  await expect(analisis).toBeFocused();

  await menu.getByRole("button", { name: /Integración de fuentes/ }).click();
  await menu
    .getByRole("list", { name: "Integración de fuentes" })
    .getByRole("link", { name: /Captura manual/ })
    .click();
  await expect(page).toHaveURL(/\/ingreso\/capturar$/);
  await expect(menu.getByRole("list")).toHaveCount(0);
});
