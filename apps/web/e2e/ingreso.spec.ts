import { expect, type Page, test } from "@playwright/test";
import { ingresar, unico } from "./ayuda";

const pdf = (texto: string) => Buffer.from(`%PDF-1.4\n% ${texto}\n%%EOF\n`);
const archivo = (name: string, buffer: Buffer, mimeType = "application/pdf") => ({
  name,
  mimeType,
  buffer,
});

async function encargoNuevo(page: Page, prefijo: string) {
  await page.getByRole("link", { name: "Nuevo encargo" }).first().click();
  const nombre = unico(prefijo);
  await page.getByLabel("Nombre").fill(nombre);
  await page.getByRole("button", { name: "Crear encargo" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(nombre);
  await page
    .getByRole("navigation", { name: "Módulos" })
    .getByRole("link", { name: "Ingreso de documentos" })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Ingreso de documentos");
}

async function clasificarLote(page: Page, expediente: string) {
  await page.getByLabel("Tipo de documento del lote").selectOption({ label: "Contrato" });
  await page
    .getByLabel("Expediente del lote", { exact: true })
    .selectOption({ label: "Nuevo expediente…" });
  await page.getByLabel("Identificador del expediente nuevo del lote").fill(expediente);
  await page.getByLabel("Fuente del lote").fill("Entrega física");
}

test("dos PDF con pre-clasificación quedan como registros pendientes; el duplicado se avisa", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await ingresar(page, "auditor");
  await encargoNuevo(page, "Ingreso e2e");
  const marca = unico("pdf");
  const a = archivo("contrato-a.pdf", pdf(`${marca} A`));
  const b = archivo("convenio-b.pdf", pdf(`${marca} B`));

  await clasificarLote(page, "EXP-E2E");
  await page.getByLabel("Archivos", { exact: true }).setInputFiles([a, b]);
  const porSubir = page.getByRole("list", { name: "Archivos por subir" });
  await expect(porSubir.getByText("Listo para subir")).toHaveCount(2);
  // La pre-clasificación del lote se puede ajustar por archivo.
  await page
    .getByLabel("Tipo de documento de convenio-b.pdf")
    .selectOption({ label: "Convenio modificatorio" });

  await page.getByRole("button", { name: /Subir 2 documento/ }).click();
  await expect(page.getByTestId("aviso-ingreso")).toHaveText("2 de 2 documento(s) registrados.", {
    timeout: 60_000,
  });

  const tabla = page.getByRole("region", { name: "Documentos ingresados" });
  await expect(tabla.getByRole("row")).toHaveCount(3);
  await expect(tabla.getByText("Pendiente", { exact: true })).toHaveCount(2);
  await expect(tabla.getByRole("row", { name: /contrato-a\.pdf/ })).toContainText("Contrato");
  await expect(tabla.getByRole("row", { name: /convenio-b\.pdf/ })).toContainText(
    "Convenio modificatorio",
  );
  await expect(tabla.getByText("EXP-E2E")).toHaveCount(2);

  // El mismo archivo otra vez: se avisa antes de subir y no se crea otro.
  await page.getByRole("button", { name: "Limpiar terminados" }).click();
  await page
    .getByLabel("Archivos", { exact: true })
    .setInputFiles([archivo("copia.pdf", a.buffer)]);
  await expect(
    porSubir.getByText(/Duplicado · Ya existe en este encargo como «contrato-a\.pdf»/),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: /^Subir/ })).toBeDisabled();
  await expect(tabla.getByRole("row")).toHaveCount(3);

  // Procesador de trabajos: exige el secreto; después los registros esperan extracción.
  expect((await page.request.get("/api/trabajos/procesar")).status()).not.toBe(200);
  if (process.env.CRON_SECRET) {
    const r = await page.request.get("/api/trabajos/procesar", {
      headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    });
    expect(r.status()).toBe(200);
    await page.reload();
    await expect(tabla.getByText("En espera de extracción")).toHaveCount(2);
  }

  // Visor del original con enlace firmado de corta duración.
  await tabla.getByRole("link", { name: "contrato-a.pdf" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("contrato-a.pdf");
  const visor = page.locator('iframe[title="Original: contrato-a.pdf"]');
  await expect(visor).toHaveAttribute("src", /\/object\/sign\/originales\/.+token=/);
  const original = await page.request.get((await visor.getAttribute("src")) ?? "");
  expect(original.status()).toBe(200);
  expect(Buffer.compare(await original.body(), a.buffer)).toBe(0);
});

test("una huella que no coincide, o un contenido que no es lo que dice, se rechaza y queda en bitácora", async ({
  page,
}) => {
  test.setTimeout(120_000);
  // Simula un navegador que declara una huella distinta a la del archivo que sube.
  await page.addInitScript(() => {
    const original = crypto.subtle.digest.bind(crypto.subtle);
    crypto.subtle.digest = async (algoritmo: AlgorithmIdentifier, datos: BufferSource) => {
      const r = new Uint8Array(await original(algoritmo, datos));
      if ((window as unknown as { alterarHuella?: boolean }).alterarHuella)
        r[0] = (r[0] ?? 0) ^ 0xff;
      return r.buffer;
    };
  });
  await ingresar(page, "auditor");
  await encargoNuevo(page, "Rechazo e2e");
  await clasificarLote(page, "EXP-RECHAZO");

  await page.evaluate(() => {
    (window as unknown as { alterarHuella?: boolean }).alterarHuella = true;
  });
  await page
    .getByLabel("Archivos", { exact: true })
    .setInputFiles([archivo("alterado.pdf", pdf(unico("alterado")))]);
  await page.getByRole("button", { name: /Subir 1 documento/ }).click();
  const porSubir = page.getByRole("list", { name: "Archivos por subir" });
  await expect(
    porSubir.getByText(/Rechazado · Rechazado: la huella calculada en el servidor no coincide/),
  ).toBeVisible({
    timeout: 60_000,
  });

  await page.evaluate(() => {
    (window as unknown as { alterarHuella?: boolean }).alterarHuella = false;
  });
  await page
    .getByLabel("Archivos", { exact: true })
    .setInputFiles([
      archivo("pagina.pdf", Buffer.from(`<html><script>alert(1)</script>${unico("x")}</html>`)),
    ]);
  await page.getByRole("button", { name: /Subir 1 documento/ }).click();
  await expect(porSubir.getByText(/el contenido no corresponde a un archivo \.pdf/)).toBeVisible({
    timeout: 60_000,
  });

  // Ninguno quedó como documento; ambos están en bitácora.
  await expect(page.getByRole("region", { name: "Documentos ingresados" })).toContainText(
    "Aún no hay documentos ingresados",
  );
  const rechazados = page.getByRole("region", { name: "Documentos rechazados" });
  await expect(rechazados.getByRole("listitem").filter({ hasText: "alterado.pdf" })).toContainText(
    "La huella del servidor no coincide",
  );
  await expect(rechazados.getByRole("listitem").filter({ hasText: "pagina.pdf" })).toContainText(
    "El contenido no corresponde al tipo de archivo",
  );
});

test("lector consulta los documentos pero no puede ingresar", async ({ page }) => {
  await ingresar(page, "lector");
  await page.getByRole("link", { name: "Encargo de prueba" }).click();
  await page
    .getByRole("navigation", { name: "Módulos" })
    .getByRole("link", { name: "Ingreso de documentos" })
    .click();
  await expect(
    page.getByText("Tu rol permite consultar los documentos, no ingresarlos."),
  ).toBeVisible();
  await expect(page.getByLabel("Archivos", { exact: true })).toHaveCount(0);
});
