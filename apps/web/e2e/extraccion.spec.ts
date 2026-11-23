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
    "ia · 95% · validado",
  );
  await expect(datos.getByRole("row", { name: /numero_contrato/ })).toContainText("Página 1");
  await expect(datos.getByRole("row", { name: /^monto/ })).toContainText("ia · 50% · pendiente");
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

test("validación: lo leído no cuenta hasta validarlo; corregir conserva lo que leyó la IA; y una captura que difiere de su documento genera R11", async ({
  page,
}) => {
  test.skip(process.env.IA_SIMULADA !== "1", "Requiere IA_SIMULADA=1 en el servidor de pruebas");
  test.setTimeout(300_000);
  await ingresar(page, "admin");
  await page.getByRole("link", { name: "Nuevo encargo" }).first().click();
  const encargo = unico("Validación e2e");
  await page.getByLabel("Nombre").fill(encargo);
  await page.getByRole("button", { name: "Crear encargo" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(encargo);
  const modulos = page.getByRole("navigation", { name: "Módulos" });

  // IA permitida en el encargo desde el principio.
  await modulos.getByRole("link", { name: "Configuración" }).click();
  await page.getByLabel(`Anthropic (Claude) en ${encargo}`).check();
  await page.getByRole("button", { name: `Guardar IA de ${encargo}` }).click();
  await expect(
    page.getByText(/^Guardado\. Los documentos de este encargo pueden enviarse/),
  ).toBeVisible();

  // 1. Un contrato leído por la IA: el monto queda bajo el umbral.
  await modulos.getByRole("link", { name: "Ingreso de documentos" }).click();
  await expect(page).toHaveURL(/\/ingreso\/importar/);
  await page.getByLabel("Tipo de documento del lote").selectOption({ label: "Contrato" });
  await page
    .getByLabel("Expediente del lote", { exact: true })
    .selectOption({ label: "Nuevo expediente…" });
  await page.getByLabel("Identificador del expediente nuevo del lote").fill("EXP-VAL");
  await page.getByLabel("Fuente del lote").fill("Entrega física");
  await subir(page, pdf("contrato-val.pdf", contrato));
  const tabla = page.getByRole("region", { name: "Documentos ingresados" });
  await esperarFila(
    page,
    tabla.getByRole("row", { name: /contrato-val\.pdf/ }),
    "Extraído · leído con Anthropic (Claude)",
  );

  // 2. Aparece en la cola con lo que falta revisar; el proveedor todavía no es entidad.
  await modulos.getByRole("link", { name: "Validación" }).click();
  await expect(page).toHaveURL(/\/validacion$/);
  const cola = page.getByRole("region", { name: "Cola de validación" });
  await expect(cola.getByRole("row", { name: /contrato-val\.pdf/ })).toContainText("por revisar");
  await modulos.getByRole("link", { name: "Captura manual" }).click();
  await expect(page.locator("datalist option[value='CONSTRUCTORA IA E2E SA DE CV']")).toHaveCount(
    0,
  );

  // 3. Pantalla de validación: el formulario trae lo que propuso la IA, con confianza y página.
  await modulos.getByRole("link", { name: "Validación" }).click();
  await cola.getByRole("link", { name: "contrato-val.pdf" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Validar: Contrato");
  await expect(page.getByRole("region", { name: "Documento original" })).toBeVisible();
  // Con cacheComponents, la página anterior (Captura manual) sigue en el DOM, oculta: los campos
  // se buscan dentro de la región visible.
  const lectura = page.getByRole("region", { name: "Lectura de la IA" });
  const numero = lectura.getByLabel("Número de contrato", { exact: true });
  await expect(numero).toHaveValue("SOP-IA-001");
  await expect(lectura.getByLabel(/^Tipo de documento/)).toBeDisabled();
  await expect(lectura.getByLabel(/^Fuente declarada/)).toHaveCount(0);
  const monto = lectura.getByLabel("Monto", { exact: true });
  await expect(monto).toHaveValue("$1,500,000.00");
  const notaMonto = page.locator(`#${await monto.getAttribute("aria-describedby")}`);
  await expect(notaMonto).toContainText("IA · 50% · pág. 2 · por revisar");
  await expect(notaMonto).toContainText("Se acepta");
  await expect(lectura.getByLabel("Nombre del involucrado 1")).toHaveValue(
    "CONSTRUCTORA IA E2E SA DE CV",
  );

  // Enfocar un campo lleva el documento a su página; Alt+↓ va al siguiente dato por revisar.
  await numero.focus();
  await expect(page.getByRole("region", { name: "Documento original" })).toContainText("Página 1");
  await page.keyboard.press("Alt+ArrowDown");
  await expect(monto).toBeFocused();
  await expect(page.getByRole("region", { name: "Documento original" })).toContainText("Página 2");

  // Corregir el monto y rechazar el objeto.
  await monto.fill("1,800,000.00");
  await expect(notaMonto).toContainText("Se corrige (la IA leyó «$1,500,000.00»)");
  await lectura.getByRole("button", { name: /^Rechazar Objeto/ }).click();
  await page.keyboard.press("Control+Enter");
  await expect(page).toHaveURL(/\/validacion\?listo=1$/);
  await expect(page.getByText("Listo. No queda nada por validar.")).toBeVisible();

  // 4. El registro quedó corregido, conserva lo que leyó la IA y el proveedor ya es entidad.
  await modulos.getByRole("link", { name: "Ingreso de documentos" }).click();
  await expect(page).toHaveURL(/\/ingreso\/importar/);
  await tabla.getByRole("link", { name: "contrato-val.pdf" }).click();
  await expect(page).toHaveURL(/\/documentos\//);
  await page.getByRole("link", { name: /^Contrato SOP-IA-001/ }).click();
  const datos = page.getByRole("region", { name: "Datos de origen" });
  const filaMonto = datos.getByRole("row", { name: /^monto/ });
  await expect(filaMonto).toContainText("1,800,000.00");
  await expect(filaMonto).toContainText("La IA leyó «$1,500,000.00»");
  await expect(filaMonto).toContainText("corregido");
  await expect(datos.getByRole("row", { name: /^objeto/ })).toContainText("rechazado");
  await expect(datos.getByRole("row", { name: /numero_contrato/ })).toContainText("validado");
  await expect(page.getByRole("link", { name: "CONSTRUCTORA IA E2E SA DE CV" })).toBeVisible();

  // 5. R11: una captura con un monto y su documento con otro.
  await modulos.getByRole("link", { name: "Captura manual" }).click();
  const visible = { visible: true };
  await page
    .getByLabel(/^Tipo de documento/)
    .filter(visible)
    .selectOption({ label: "Contrato" });
  await page
    .getByLabel(/^Fuente declarada/)
    .filter(visible)
    .fill("Entrevista con el área contratante");
  await page.getByLabel("Número de contrato", { exact: true }).filter(visible).fill("SOP-IA-001");
  await page.getByLabel("Monto", { exact: true }).filter(visible).fill("1,000,000.00");
  await page.getByRole("button", { name: "Guardar captura" }).click();
  await expect(page.getByText("Sin soporte documental", { exact: true })).toBeVisible();
  const soporte = pdf("soporte-r11.pdf", { ...contrato, involucrados: [] });
  const asociar = page.getByRole("button", { name: "Asociar documento" });
  await expect(async () => {
    await page.getByLabel("Documento de soporte").setInputFiles(soporte);
    await expect(asociar).toBeEnabled({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
  await asociar.click();
  await expect(page.getByRole("link", { name: "soporte-r11.pdf" })).toBeVisible({
    timeout: 60_000,
  });
  await modulos.getByRole("link", { name: "Alertas" }).click();
  await expect(page).toHaveURL(/\/alertas$/);
  await expect(async () => {
    if (process.env.CRON_SECRET) {
      await page.request.get("/api/trabajos/procesar", {
        headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        timeout: 30_000,
      });
    }
    await page.reload();
    await expect(page.getByText("La captura y su documento difieren en monto")).toBeVisible({
      timeout: 3_000,
    });
  }).toPass({ timeout: 90_000 });
  // El número de contrato coincide: no hay alerta por él.
  await expect(page.getByText("difieren en número de contrato")).toHaveCount(0);
  // La cola de validación sigue vacía: la lectura del documento de una captura no se valida.
  await modulos.getByRole("link", { name: "Validación" }).click();
  await expect(page.getByText("No hay documentos por validar.")).toBeVisible();
});

test("lector consulta la cola de validación pero no valida", async ({ page }) => {
  await ingresar(page, "lector");
  await page.getByRole("link", { name: "Encargo de prueba" }).click();
  await page
    .getByRole("navigation", { name: "Módulos" })
    .getByRole("link", { name: "Validación" })
    .click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Validación");
  await expect(page.getByText("Tu rol permite consultar la cola, no validar.")).toBeVisible();
});

test("volver a leer con IA: la lectura anterior queda reemplazada y el documento regresa a la cola", async ({
  page,
}) => {
  test.skip(process.env.IA_SIMULADA !== "1", "Requiere IA_SIMULADA=1 en el servidor de pruebas");
  test.setTimeout(300_000);
  await ingresar(page, "admin");
  await page.getByRole("link", { name: "Nuevo encargo" }).first().click();
  const encargo = unico("Releer e2e");
  await page.getByLabel("Nombre").fill(encargo);
  await page.getByRole("button", { name: "Crear encargo" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(encargo);
  const modulos = page.getByRole("navigation", { name: "Módulos" });
  await modulos.getByRole("link", { name: "Configuración" }).click();
  await page.getByLabel(`Anthropic (Claude) en ${encargo}`).check();
  await page.getByRole("button", { name: `Guardar IA de ${encargo}` }).click();
  await expect(
    page.getByText(/^Guardado\. Los documentos de este encargo pueden enviarse/),
  ).toBeVisible();

  await modulos.getByRole("link", { name: "Ingreso de documentos" }).click();
  await expect(page).toHaveURL(/\/ingreso\/importar/);
  await page.getByLabel("Tipo de documento del lote").selectOption({ label: "Contrato" });
  await page
    .getByLabel("Expediente del lote", { exact: true })
    .selectOption({ label: "Nuevo expediente…" });
  await page.getByLabel("Identificador del expediente nuevo del lote").fill("EXP-RELEER");
  await page.getByLabel("Fuente del lote").fill("Entrega física");
  await subir(page, pdf("contrato-releer.pdf", contrato));
  const tabla = page.getByRole("region", { name: "Documentos ingresados" });
  const fila = tabla.getByRole("row", { name: /contrato-releer\.pdf/ });
  await esperarFila(page, fila, "Extraído · leído con Anthropic (Claude)");

  // 1. Desde Ingreso: dos pasos, y el documento vuelve a la cola de lectura.
  await fila.getByRole("button", { name: "Volver a leer con IA contrato-releer.pdf" }).click();
  const confirmar = fila.getByRole("group", {
    name: "Confirmar nueva lectura de contrato-releer.pdf",
  });
  await expect(confirmar).toContainText("La anterior queda en el historial");
  await confirmar.getByRole("button", { name: "Cancelar" }).click();
  await expect(confirmar).toHaveCount(0);
  await fila.getByRole("button", { name: "Volver a leer con IA contrato-releer.pdf" }).click();
  await confirmar.getByRole("button", { name: "Sí, volver a leer" }).click();
  // El botón desaparece mientras el documento está en cola (la lectura simulada tarda segundos).
  await expect(confirmar).toHaveCount(0);
  await esperarFila(page, fila, "Extraído · leído con Anthropic (Claude)");

  // 2. La validación muestra solo la lectura vigente (un solo juego de campos).
  await modulos.getByRole("link", { name: "Validación" }).click();
  const cola = page.getByRole("region", { name: "Cola de validación" });
  await expect(cola.getByRole("row", { name: /contrato-releer\.pdf/ })).toHaveCount(1);
  await cola.getByRole("link", { name: "contrato-releer.pdf" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Validar: Contrato");
  const lectura = page.getByRole("region", { name: "Lectura de la IA" });
  await expect(lectura.getByLabel("Número de contrato", { exact: true })).toHaveValue("SOP-IA-001");
  await expect(lectura.getByLabel("Nombre del involucrado 2")).toHaveCount(0);

  // 3. Desde Validación: se pide la lectura y regresa a la cola.
  await page.getByRole("button", { name: "Volver a leer con IA contrato-releer.pdf" }).click();
  await page.getByRole("button", { name: "Sí, volver a leer" }).click();
  await expect(page).toHaveURL(/\/validacion$/);
  await expect(cola).toBeVisible();
});
