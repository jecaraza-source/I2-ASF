import { expect, test } from "@playwright/test";
import { ingresar, unico } from "./ayuda";

const visible = { visible: true };

test("estados vacíos de un encargo nuevo y página no encontrada", async ({ page }) => {
  test.setTimeout(120_000);
  await ingresar(page, "auditor");
  await page.getByRole("link", { name: "Nuevo encargo" }).first().click();
  const nombre = unico("Vacío e2e");
  await page.getByLabel("Nombre").fill(nombre);
  await page.getByRole("button", { name: "Crear encargo" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(nombre);
  const base = page.url().replace(/(\/encargos\/[0-9a-f-]{36}).*$/, "$1");

  // Cada módulo dice que no hay nada y qué hacer, en vez de una tabla vacía o un error.
  const casos: [string, RegExp][] = [
    ["/red", /Aún no hay (redes generadas|una red generada)/],
    ["/red/vista", /Aún no hay (redes generadas|una red generada)/],
    ["/validacion", /No hay documentos por validar/],
    ["/alertas", /alerta/i],
    ["/registros", /0 registro\(s\)/],
    ["/expedientes", /Este encargo aún no tiene expedientes/],
  ];
  for (const [ruta, texto] of casos) {
    await page.goto(`${base}${ruta}`);
    await expect(page.locator("main").filter(visible).first()).toContainText(texto);
    await expect(page.getByText("No se pudo cargar esta pantalla.")).toHaveCount(0);
  }

  // Un encargo que no existe (o de otra organización) da la página de no encontrado.
  await page.goto("/encargos/00000000-0000-4000-8000-000000000999");
  await expect(page.getByRole("heading", { name: "No encontramos esta página" })).toBeVisible();
  await page.goto("/encargos/no-es-un-id");
  await expect(page.getByRole("heading", { name: "No encontramos esta página" })).toBeVisible();
  await page.getByRole("link", { name: "Ir a mis encargos" }).click();
  await expect(page).toHaveURL(/\/encargos$/);
});
