import { expect, test } from "@playwright/test";
import { ingresar } from "./ayuda";

/**
 * Prueba de carga (tarea 13). Requiere los datos de `supabase/carga/sembrar.sql`: en CI se siembran
 * antes de la suite; en local, si no están, la prueba se omite.
 */
const ENCARGO = "c0000000-0000-4000-8000-0000000000ca";
const EXPEDIENTE = "d0000000-0000-4000-8000-0000000000ca";
const visible = { visible: true };

test.describe("carga: 5,000 entidades y 50,000 registros", () => {
  test.beforeEach(async ({ page }) => {
    await ingresar(page, "auditor");
    const r = await page.request.get(`/encargos/${ENCARGO}`);
    test.skip(r.status() !== 200, "sin datos de carga sembrados");
  });

  test("la vista de la red dibuja 5,000 entidades sin trabar el navegador", async ({ page }) => {
    test.setTimeout(180_000);
    const inicio = Date.now();
    await page.goto(`/encargos/${ENCARGO}/red/vista`);
    const resumen = page.getByTestId("resumen-vista").filter(visible);
    await expect(resumen).toContainText("5,000 entidades", { timeout: 90_000 });
    await expect(page.getByTestId("aviso-red-grande").filter(visible)).toBeVisible();
    await expect(
      page.getByRole("img", { name: "Red de vínculos" }).locator("canvas").first(),
    ).toBeVisible();
    const dibujo = Date.now() - inicio;

    // La página responde: centrar una entidad redibuja con sus vecinas.
    const t0 = Date.now();
    await page.getByLabel("Buscar entidad").fill("ENTIDAD SINTETICA 2500");
    await page.getByRole("button", { name: "Centrar", exact: true }).click();
    await expect(page).toHaveURL(/foco=[0-9a-f-]{36}/);
    await expect(resumen).toContainText("relaciones directas de la entidad central", {
      timeout: 30_000,
    });
    const centrar = Date.now() - t0;
    test.info().annotations.push({
      type: "tiempo",
      description: `vista ${dibujo} ms · centrar ${centrar} ms`,
    });
    expect(dibujo).toBeLessThan(60_000);
    expect(centrar).toBeLessThan(15_000);
  });

  test("el expediente con 50,000 registros pagina y filtra", async ({ page }) => {
    test.setTimeout(180_000);
    const inicio = Date.now();
    await page.goto(`/encargos/${ENCARGO}/expedientes/${EXPEDIENTE}`);
    const resumen = page.getByTestId("resumen-documental").filter(visible);
    await expect(resumen).toHaveText(/^50,000 registro\(s\)/, { timeout: 60_000 });
    const primera = Date.now() - inicio;
    await expect(page.getByText(/Página 1 de [\d,]+/).filter(visible)).toBeVisible();

    const t0 = Date.now();
    await page.getByRole("link", { name: "Siguiente →" }).filter(visible).click();
    await expect(page.getByText(/Página 2 de [\d,]+/).filter(visible)).toBeVisible({
      timeout: 60_000,
    });
    const segunda = Date.now() - t0;

    const t1 = Date.now();
    await page.goto(`/encargos/${ENCARGO}/expedientes/${EXPEDIENTE}?q=F-4999`);
    await expect(resumen).toHaveText(/^\d+ registro\(s\)/, { timeout: 60_000 });
    const busqueda = Date.now() - t1;
    test.info().annotations.push({
      type: "tiempo",
      description: `primera ${primera} ms · siguiente ${segunda} ms · búsqueda ${busqueda} ms`,
    });
    expect(primera).toBeLessThan(30_000);
    expect(segunda).toBeLessThan(30_000);
  });
});
