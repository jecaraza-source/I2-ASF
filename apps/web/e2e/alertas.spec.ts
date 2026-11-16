import path from "node:path";
import { expect, test } from "@playwright/test";
import { ingresar, unico } from "./ayuda";

const FIXTURES = path.join(__dirname, "..", "..", "..", "fixtures");

test("alertas del 07734: R02, R03 y R04 con sus evidencias; descartar con motivo", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await ingresar(page, "auditor");

  await page.getByRole("link", { name: "Nuevo encargo" }).first().click();
  const nombre = unico("Alertas e2e");
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
    { timeout: 90_000 },
  );

  // Las reglas corrieron al terminar la importación.
  await modulos.getByRole("link", { name: "Alertas" }).click();
  const lista = page.getByRole("list", { name: "Alertas" });
  await expect(
    lista.getByRole("link", { name: "Monto total contratado: 3 cifras distintas" }),
  ).toBeVisible();
  await expect(
    lista.getByRole("link", { name: "Vínculo afirma 87 llamadas y hay 0" }),
  ).toBeVisible();
  await expect(
    lista.getByRole("link", {
      name: "«RECURSOS FUGADOS AL EXTERIOR» reporta $116,500,000.00 y el detalle da $138,500,000.00",
    }),
  ).toBeVisible();

  // Filtro por regla.
  await page
    .getByRole("navigation", { name: "Filtros" })
    .getByRole("link", { name: /^R02/ })
    .click();
  await expect(lista.getByRole("listitem")).toHaveCount(1);

  // Detalle: las evidencias lado a lado y enlace al origen.
  await lista.getByRole("link", { name: "Monto total contratado: 3 cifras distintas" }).click();
  const evidencias = page.getByRole("region", { name: "Evidencias" });
  await expect(evidencias.getByRole("article")).toHaveCount(3);
  for (const monto of ["$1,847,320,450.00", "$1,947,320,450.00", "$1,948,320,450.00"]) {
    await expect(evidencias.getByText(monto, { exact: true })).toBeVisible();
  }
  await expect(evidencias).toContainText("Hoja PORTADA");
  await expect(evidencias).toContainText("Hoja RESUMEN EJECUTIVO");

  // Descartar exige motivo y queda registrado.
  await page.getByLabel("Motivo").fill("Error de captura en la portada, confirmado con el área");
  await page.getByRole("button", { name: "Descartar alerta" }).click();
  await expect(page.getByTestId("resolucion")).toContainText("Descartada");
  await expect(page.getByTestId("resolucion")).toContainText("Error de captura en la portada");

  // El enlace lleva a la celda de origen.
  await evidencias
    .getByRole("link", { name: /Ver en el origen/ })
    .first()
    .click();
  await expect(page.getByRole("region", { name: "Datos de origen" })).toContainText(
    "total_declarado",
  );

  // Reejecutar a demanda no duplica ni reabre la descartada.
  await modulos.getByRole("link", { name: "Alertas" }).click();
  await page.getByRole("button", { name: "Ejecutar reglas" }).click();
  await expect(page.getByRole("status").filter({ hasText: "0 alerta(s) nueva(s)" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(
    lista.getByRole("link", { name: "Monto total contratado: 3 cifras distintas" }),
  ).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Filtros" })
    .getByRole("link", { name: /^Descartada \(1\)/ })
    .click();
  await expect(
    lista.getByRole("link", { name: "Monto total contratado: 3 cifras distintas" }),
  ).toBeVisible();
});

test("lector ve las alertas pero no ejecuta reglas", async ({ page }) => {
  await ingresar(page, "lector");
  await page.getByRole("link", { name: "Encargo de prueba" }).click();
  await page
    .getByRole("navigation", { name: "Módulos" })
    .getByRole("link", { name: "Alertas" })
    .click();
  await expect(page.getByRole("heading", { name: "Alertas", level: 1 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ejecutar reglas" })).toHaveCount(0);
});
