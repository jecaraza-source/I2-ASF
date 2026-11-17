import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ingresar } from "./ayuda";

/**
 * Accesibilidad básica (WCAG 2.1 A y AA con axe): etiquetas, contraste, nombres de botones y
 * enlaces, roles y estructura. Falla con hallazgos graves o críticos.
 */
const ENCARGO = "/encargos/c0000000-0000-4000-8000-000000000001";

async function revisar(page: Page, ruta: string) {
  await page.goto(ruta);
  await expect(page.locator("main").first()).toBeVisible();
  const r = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    // El lienzo de Cytoscape es un dibujo; su alternativa es el panel de la ficha y las listas.
    .exclude("canvas")
    .analyze();
  const graves = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(
    graves.map(
      (v) =>
        `${v.id}: ${v.nodes
          .map((n) => n.target.join(" "))
          .slice(0, 3)
          .join(" | ")}`,
    ),
    `hallazgos de accesibilidad en ${ruta}`,
  ).toEqual([]);
}

test("ingreso sin sesión", async ({ page }) => {
  await revisar(page, "/ingresar");
});

test("pantallas del auditor", async ({ page }) => {
  test.setTimeout(240_000);
  await ingresar(page, "auditor");
  for (const ruta of [
    "/encargos",
    ENCARGO,
    `${ENCARGO}/expedientes`,
    `${ENCARGO}/registros`,
    `${ENCARGO}/ingreso/importar`,
    `${ENCARGO}/ingreso/capturar`,
    `${ENCARGO}/importaciones`,
    `${ENCARGO}/validacion`,
    `${ENCARGO}/red`,
    `${ENCARGO}/red/vista`,
    `${ENCARGO}/alertas`,
    `${ENCARGO}/recorridos`,
  ]) {
    await revisar(page, ruta);
  }
});

test("pantallas del administrador", async ({ page }) => {
  test.setTimeout(180_000);
  await ingresar(page, "admin");
  for (const ruta of [`${ENCARGO}/configuracion`, "/usuarios", "/ia"]) {
    await revisar(page, ruta);
  }
});

test("navegación con teclado: el primer Tab lleva al contenido y el foco se ve", async ({
  page,
}) => {
  await ingresar(page, "auditor");
  await page.goto(ENCARGO);
  await page.keyboard.press("Tab");
  const saltar = page.getByRole("link", { name: "Saltar al contenido" });
  await expect(saltar).toBeFocused();
  await expect(saltar).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.locator("#contenido")).toBeFocused();
  await page.keyboard.press("Tab");
  const enfocado = page.locator(":focus");
  await expect(enfocado).toBeVisible();
  const contorno = await enfocado.evaluate((el) => {
    const s = getComputedStyle(el);
    return s.outlineStyle !== "none" && s.outlineWidth !== "0px" ? s.outlineStyle : s.boxShadow;
  });
  expect(contorno).not.toBe("none");
});
