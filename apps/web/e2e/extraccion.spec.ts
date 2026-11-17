import { expect, type Locator, type Page, test } from "@playwright/test";
import { ingresar, unico } from "./ayuda";

/** PDF de prueba con el guion que lee la IA simulada (IA_SIMULADA=1; ninguna prueba llama a un proveedor real). */
function pdf(nombre: string, guion: Record<string, unknown>) {
  return {
    name: nombre,
    mimeType: "application/pdf",
    buffer: Buffer.from(
      `%PDF-1.4\n% ${unico("ia")}\n%SIGMA_IA_SIMULADA ${JSON.stringify(guion)}\n%%EOF\n`,
    ),
  };
}
const dato = (valor: string, confianza: number, pagina: number) => ({ valor, confianza, pagina });
const contrato = {
  campos: {
    fecha_documento: dato("2022-03-15", 0.99, 1),
    numero_contrato: dato("SOP-IA-001", 0.95, 1),
    monto: dato("$1,500,000.00", 0.5, 2),
    objeto: dato("Rehabilitación de la carretera", 0.9, 1),
  },
  involucrados: [
    {
      tipo: "persona_moral",
      nombre: "CONSTRUCTORA IA E2E SA DE CV",
      rol: "proveedor",
      rfc: "CIE200101AB1",
      curp: null,
      confianza: 0.97,
      pagina: 1,
    },
  ],
};

async function subir(page: Page, archivo: ReturnType<typeof pdf>) {
  await page.getByLabel("Archivos", { exact: true }).setInputFiles([archivo]);
  await page.getByRole("button", { name: /Subir 1 documento/ }).click();
  await expect(page.getByTestId("aviso-ingreso")).toHaveText("1 de 1 documento(s) registrados.", {
    timeout: 60_000,
  });
  await page.getByRole("button", { name: "Limpiar terminados" }).click();
}

/** La lectura corre después de responder; se recarga hasta ver el resultado (el cron es el respaldo). */
async function esperarFila(page: Page, fila: Locator, texto: string | RegExp) {
  await expect(async () => {
    if (process.env.CRON_SECRET) {
      await page.request.get("/api/trabajos/procesar", {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        timeout: 30_000,
      });
    }
    await page.reload();
    await expect(fila).toContainText(texto, { timeout: 3_000 });
  }).toPass({ timeout: 90_000 });
}

test("extracción con IA: espera con la IA apagada, lee al encenderla y usa OpenAI cuando Anthropic llega a su límite", async ({
  page,
}) => {
  test.skip(process.env.IA_SIMULADA !== "1", "Requiere IA_SIMULADA=1 en el servidor de pruebas");
  test.setTimeout(300_000);
  await ingresar(page, "admin");
  await page.getByRole("link", { name: "Nuevo encargo" }).first().click();
  const encargo = unico("Extracción e2e");
  await page.getByLabel("Nombre").fill(encargo);
  await page.getByRole("button", { name: "Crear encargo" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(encargo);
  const modulos = page.getByRole("navigation", { name: "Módulos" });
  await modulos.getByRole("link", { name: "Ingreso de documentos" }).click();
  await page.getByLabel("Tipo de documento del lote").selectOption({ label: "Contrato" });
  await page
    .getByLabel("Expediente del lote", { exact: true })
    .selectOption({ label: "Nuevo expediente…" });
  await page.getByLabel("Identificador del expediente nuevo del lote").fill("EXP-IA");
  await page.getByLabel("Fuente del lote").fill("Entrega física");
  const tabla = page.getByRole("region", { name: "Documentos ingresados" });

  // 1. Con la IA apagada en el encargo el documento no sale a ningún proveedor: espera.
  await subir(page, pdf("contrato-ia.pdf", contrato));
  const fila = tabla.getByRole("row", { name: /contrato-ia\.pdf/ });
  await esperarFila(page, fila, "En espera de extracción · El encargo no permite este proveedor");

  // 2. El administrador permite ambos proveedores; lo que esperaba vuelve a la cola y se lee.
  await modulos.getByRole("link", { name: "Configuración" }).click();
  await page.getByLabel(`Anthropic (Claude) en ${encargo}`).check();
  await page.getByLabel(`OpenAI (ChatGPT) en ${encargo}`).check();
  await page.getByRole("button", { name: `Guardar IA de ${encargo}` }).click();
  await expect(page.getByText("1 documento(s) en espera volvieron a la cola.")).toBeVisible();
  await modulos.getByRole("link", { name: "Ingreso de documentos" }).click();
  // Sin esta espera, la recarga de `esperarFila` puede ganarle a la navegación y quedarse en Configuración.
  await expect(page).toHaveURL(/\/ingreso\/importar/);
  await esperarFila(page, fila, "Extraído · leído con Anthropic (Claude)");

  // 3. Cada campo trae su confianza y su página; lo que no alcanza el umbral queda pendiente.
  await fila.getByRole("link", { name: "contrato-ia.pdf" }).click();
  // El segundo enlace vive en la página del documento: hay que esperar a llegar a ella.
  await expect(page).toHaveURL(/\/documentos\//);
  await page.getByRole("link", { name: "contrato-ia.pdf" }).last().click();
  const datos = page.getByRole("region", { name: "Datos de origen" });
  await expect(datos.getByRole("row", { name: /numero_contrato/ })).toContainText("SOP-IA-001");
  await expect(datos.getByRole("row", { name: /numero_contrato/ })).toContainText(
    "ia · 0.95 · validado",
  );
  await expect(datos.getByRole("row", { name: /numero_contrato/ })).toContainText("Página 1");
  await expect(datos.getByRole("row", { name: /^monto/ })).toContainText("ia · 0.50 · pendiente");
  await expect(datos.getByRole("row", { name: /^monto/ })).toContainText("Página 2");
  await expect(datos.getByRole("row", { name: /involucrado_1/ })).toContainText(
    "CONSTRUCTORA IA E2E SA DE CV",
  );

  // 4. Anthropic rechaza por límite de uso (429): la lectura pasa a OpenAI.
  await modulos.getByRole("link", { name: "Ingreso de documentos" }).click();
  await expect(page).toHaveURL(/\/ingreso\/importar/);
  await page.getByLabel("Tipo de documento del lote").selectOption({ label: "Contrato" });
  await page.getByLabel("Expediente del lote", { exact: true }).selectOption({ label: "EXP-IA" });
  await page.getByLabel("Fuente del lote").fill("Entrega física");
  await subir(page, pdf("contrato-respaldo.pdf", { ...contrato, fallar: { anthropic: 429 } }));
  await esperarFila(
    page,
    tabla.getByRole("row", { name: /contrato-respaldo\.pdf/ }),
    "Extraído · leído con OpenAI (ChatGPT)",
  );

  // 5. El consumo quedó en el administrador de IA, con el fallo de Anthropic.
  await page.getByRole("link", { name: "Uso de IA" }).click();
  const consumo = page.getByRole("region", { name: "Consumo del mes" });
  await expect(consumo).toContainText("Anthropic (Claude) · simulado");
  await expect(consumo).toContainText("OpenAI (ChatGPT) · simulado");
  await expect(consumo).toContainText(encargo);
  await expect(consumo).toContainText("Error 429");
});
