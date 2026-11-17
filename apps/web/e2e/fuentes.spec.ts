import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { ingresar, unico } from "./ayuda";

const EFO = "EMPRESA FACTURADORA DE PRUEBA, S.A. DE C.V.";
const HOMONIMO = "=SUMA PROVEEDOR DOC SA DE CV";
const visible = { visible: true };

async function nuevoEncargo(page: Page, nombre: string) {
  await page.goto("/encargos");
  await page.getByRole("link", { name: "Nuevo encargo" }).first().click();
  await page.getByLabel("Nombre").fill(nombre);
  await page.getByRole("button", { name: "Crear encargo" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(nombre);
}

async function capturarCfdi(
  page: Page,
  numero: string,
  involucrados: { nombre: string; rfc: string }[],
) {
  await page
    .getByRole("navigation", { name: "Módulos" })
    .getByRole("link", { name: "Captura manual" })
    .click();
  await expect(page).toHaveURL(/\/ingreso\/capturar/);
  await page
    .getByLabel(/^Tipo de documento/)
    .filter(visible)
    .selectOption({ label: "CFDI" });
  await page
    .getByLabel(/^Fuente declarada/)
    .filter(visible)
    .fill("Oficio de la dependencia");
  await page.getByLabel("Número de factura", { exact: true }).filter(visible).fill(numero);
  await page.getByLabel("Fecha del documento").filter(visible).fill("2024-04-10");
  for (const [i, inv] of involucrados.entries()) {
    await page.getByRole("button", { name: "Agregar involucrado" }).filter(visible).click();
    await page.getByLabel(`Nombre del involucrado ${i + 1}`).fill(inv.nombre);
    await page.getByLabel(`RFC del involucrado ${i + 1}`).fill(inv.rfc);
  }
  await page.getByRole("button", { name: "Guardar captura" }).filter(visible).click();
  await expect(page).toHaveURL(/\/registros\/[0-9a-f-]{36}$/, { timeout: 30_000 });
}

/** La consulta corre después de responder; se recarga hasta verla (el cron es el respaldo). */
async function esperar(page: Page, zona: Locator, texto: string | RegExp) {
  await expect(async () => {
    if (process.env.CRON_SECRET) {
      await page.request.get("/api/trabajos/procesar", {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        timeout: 30_000,
      });
    }
    await page.reload();
    await expect(zona).toContainText(texto, { timeout: 3_000 });
  }).toPass({ timeout: 90_000 });
}

test("fuentes de consulta: carga de la lista 69-B, coincidencia exacta con alerta R10, propuesta por nombre, otros expedientes e incorporación", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await ingresar(page, "admin");

  // Un encargo anterior con el mismo proveedor: aparecerá en «Otros expedientes».
  const anterior = unico("Fuentes anterior e2e");
  await nuevoEncargo(page, anterior);
  await capturarCfdi(page, "F-ANT-1", [{ nombre: EFO, rfc: "EFO190101AB1" }]);

  const encargo = unico("Fuentes e2e");
  await nuevoEncargo(page, encargo);
  const modulos = page.getByRole("navigation", { name: "Módulos" });

  // Carga de la lista: el navegador la lee y muestra el resumen antes de enviarla.
  await page.goto(
    page.url().replace(/\/encargos\/([0-9a-f-]{36}).*$/, "/encargos/$1/configuracion"),
  );
  await page
    .getByLabel("Archivo de la lista (CSV o Excel del SAT)")
    .filter(visible)
    .setInputFiles(resolve(__dirname, "../../../fixtures/lista_69b_prueba.csv"));
  await expect(page.getByTestId("resumen-lista").filter(visible)).toHaveText(
    "5 contribuyente(s) con RFC válido · 1 repetido(s) omitido(s) · 1 fila(s) inválida(s)",
  );
  await page.getByRole("button", { name: "Cargar lista" }).filter(visible).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Lista cargada: 5 contribuyente(s)" }),
  ).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("lista-vigente").filter(visible)).toContainText(
    "lista_69b_prueba.csv · 5 contribuyentes",
  );

  // Un CFDI con el proveedor de la lista (por RFC) y un homónimo (solo coincide el nombre).
  await capturarCfdi(page, "F-69B-1", [
    { nombre: EFO, rfc: "EFO190101AB1" },
    { nombre: HOMONIMO, rfc: "SPD200101AB1" },
  ]);
  const registro = page.url();

  // Consulta de todas las entidades del encargo desde la red.
  await modulos.getByRole("link", { name: "Red de vínculos" }).click();
  await page
    .getByRole("button", { name: "Consultar fuentes de todas las entidades" })
    .filter(visible)
    .click();
  await expect(page.getByRole("status").filter(visible).first()).toBeVisible();

  // Ficha del proveedor: coincidencia exacta y el encargo anterior.
  await page.goto(registro);
  await page.getByRole("link", { name: EFO }).filter(visible).first().click();
  await expect(page).toHaveURL(/\/entidades\/[0-9a-f-]{36}$/);
  const ficha = page.url();
  const externas = page.getByRole("region", { name: "Coincidencias externas" }).filter(visible);
  const otros = page.getByRole("region", { name: "Otros expedientes" }).filter(visible);
  await esperar(page, externas, "Coincidencia exacta · por RFC");
  await expect(externas).toContainText(`${EFO} · RFC EFO190101AB1 · Definitivo`);
  await expect(otros).toContainText(anterior);

  // La regla R10 corrió al terminar la consulta.
  await modulos.getByRole("link", { name: "Alertas" }).click();
  await expect(
    page
      .getByRole("list", { name: "Alertas" })
      .filter(visible)
      .getByRole("link", { name: /aparece en la lista 69-B del SAT como definitivo$/ }),
  ).toBeVisible();
  await page.goto(ficha);

  // Confirmar e incorporar como registro: abre el registro creado.
  await page
    .getByRole("button", { name: /^Confirmar: EMPRESA FACTURADORA/ })
    .filter(visible)
    .click();
  await expect(externas).toContainText("Confirmada");
  await page.getByRole("button", { name: "Incorporar como registro" }).filter(visible).click();
  await expect(page).toHaveURL(/\/registros\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(page.locator("main").filter(visible)).toContainText("Lista 69-B del SAT");
  await page.goto(ficha);
  await expect(
    page.getByRole("link", { name: "Incorporado como registro" }).filter(visible),
  ).toBeVisible();

  // El homónimo: propuesta por nombre, sin alerta hasta que alguien la confirme; se descarta con motivo.
  await page.goto(registro);
  await page.getByRole("link", { name: HOMONIMO }).filter(visible).first().click();
  await esperar(page, externas, "Propuesta · por nombre");
  await page
    .getByRole("button", { name: /^Descartar: / })
    .filter(visible)
    .click();
  await page.getByRole("button", { name: "Confirmar descarte" }).filter(visible).click();
  await expect(page.getByRole("alert").filter(visible)).toBeVisible();
  await page.getByLabel("Motivo del descarte").filter(visible).fill("Homónimo: otro RFC");
  await page.getByRole("button", { name: "Confirmar descarte" }).filter(visible).click();
  await expect(externas).toContainText("Descartada");
  await expect(externas).toContainText("motivo: Homónimo: otro RFC");
  await modulos.getByRole("link", { name: "Alertas" }).click();
  await expect(
    page
      .getByRole("list", { name: "Alertas" })
      .filter(visible)
      .getByRole("link", { name: /como presunto$/ }),
  ).toHaveCount(0);
});

test("lector ve la ficha pero no consulta fuentes", async ({ page }) => {
  await ingresar(page, "lector");
  await page.goto("/encargos/c0000000-0000-4000-8000-000000000001/red");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Consultar fuentes de todas las entidades" }),
  ).toHaveCount(0);
});
