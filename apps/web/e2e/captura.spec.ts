import { expect, test } from "@playwright/test";
import { ingresar, unico } from "./ayuda";

test("captura un contrato sin documento, aparece en la red y deja de estar sin soporte al asociarle un archivo", async ({
  page,
}) => {
  test.setTimeout(180_000);
  await ingresar(page, "auditor");
  await page.getByRole("link", { name: "Nuevo encargo" }).first().click();
  const nombre = unico("Captura e2e");
  await page.getByLabel("Nombre").fill(nombre);
  await page.getByRole("button", { name: "Crear encargo" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(nombre);
  const modulos = page.getByRole("navigation", { name: "Módulos" });
  await modulos.getByRole("link", { name: "Captura manual" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Captura manual");

  // Formulario generado: campos comunes + los del tipo de documento.
  await page.getByLabel(/^Tipo de documento/).selectOption({ label: "Contrato" });
  await page.getByLabel("Número de contrato").fill("CAP-2026-001");
  await page.getByLabel("Fecha del documento").fill("2022-03-15");
  await page.getByLabel("Monto", { exact: true }).fill("1,500,000.00");
  await page.getByLabel("Tipo de adjudicación").fill("Adjudicación directa");

  await page.getByRole("button", { name: "Agregar involucrado" }).click();
  await page.getByLabel("Tipo del involucrado 1").selectOption({ label: "Dependencia" });
  await page.getByLabel("Nombre del involucrado 1").fill("SECRETARÍA DE OBRAS E2E");
  await page.getByLabel("Rol del involucrado 1").selectOption({ label: "Dependencia contratante" });
  await page.getByRole("button", { name: "Agregar involucrado" }).click();
  await page.getByLabel("Nombre del involucrado 2").fill("CONSTRUCTORA CAPTURA E2E SA DE CV");
  await page.getByLabel("RFC del involucrado 2").fill("CCE200101AB1");

  // La fuente declarada es obligatoria.
  await page.getByRole("button", { name: "Guardar captura" }).click();
  await expect(page.getByText("La fuente declarada es obligatoria").first()).toBeVisible();
  await page.getByLabel(/^Fuente declarada/).fill("Entrevista con el área de obras");
  await page.getByRole("button", { name: "Guardar captura" }).click();

  // Registro creado, con la etiqueta.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Contrato CAP-2026-001 (captura manual)",
    {
      timeout: 30_000,
    },
  );
  const urlRegistro = page.url();
  await expect(page.getByText("Sin soporte documental", { exact: true })).toBeVisible();
  await expect(page.getByRole("region", { name: "Datos de origen" })).toContainText("1500000.00");
  await expect(page.getByRole("link", { name: "CONSTRUCTORA CAPTURA E2E SA DE CV" })).toBeVisible();

  // Aparece en la lista de capturas y el autocompletado conoce a la entidad.
  await modulos.getByRole("link", { name: "Captura manual" }).click();
  const capturas = page.getByRole("region", { name: "Capturas" });
  await expect(capturas.getByRole("row", { name: /CAP-2026-001/ })).toContainText(
    "Sin soporte documental",
  );
  await page.getByRole("button", { name: "Agregar involucrado" }).click();
  await page.getByLabel("Nombre del involucrado 1").fill("CONSTRUCTORA CAPTURA E2E SA DE CV");
  await expect(page.getByLabel("RFC del involucrado 1")).toHaveValue("CCE200101AB1");

  // Tras generar la red, las entidades capturadas y su contrato están ahí.
  await modulos.getByRole("link", { name: "Red de vínculos" }).click();
  await page.getByRole("button", { name: "Generar red" }).click();
  await expect(page.getByLabel("Indicadores")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("indicador-Entidades")).toContainText("2");
  await expect(page.getByTestId("indicador-Eventos")).toContainText("1");
  await expect(page.getByRole("region", { name: "Entidades calificadas" })).toContainText(
    "CONSTRUCTORA CAPTURA E2E SA DE CV",
  );

  // Asociar el documento: deja de mostrarse «sin soporte documental».
  await page.goto(urlRegistro);
  const soporte = {
    name: "contrato-cap.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from(`%PDF-1.4\n% ${unico("soporte")}\n%%EOF\n`),
  };
  const asociar = page.getByRole("button", { name: "Asociar documento" });
  // Tras una carga completa, el campo puede recibir el archivo antes de que la página esté
  // interactiva; se reintenta hasta que el botón se habilita.
  await expect(async () => {
    await page.getByLabel("Documento de soporte").setInputFiles(soporte);
    await expect(asociar).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await asociar.click();
  await expect(page.getByRole("link", { name: "contrato-cap.pdf" })).toBeVisible({
    timeout: 60_000,
  });
  await expect(page.getByText("Sin soporte documental", { exact: true })).toHaveCount(0);
  await modulos.getByRole("link", { name: "Captura manual" }).click();
  await expect(capturas.getByRole("row", { name: /CAP-2026-001/ })).toContainText("Con documento");
});

test("lector consulta las capturas pero no captura", async ({ page }) => {
  await ingresar(page, "lector");
  await page.getByRole("link", { name: "Encargo de prueba" }).click();
  await page
    .getByRole("navigation", { name: "Módulos" })
    .getByRole("link", { name: "Captura manual" })
    .click();
  await expect(page.getByText("Tu rol permite consultar las capturas, no crearlas.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Guardar captura" })).toHaveCount(0);
});
