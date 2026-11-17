import { createHash } from "node:crypto";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { leerDatosAdjuntos } from "@sigma/i2-export";
import { ingresar, unico } from "./ayuda";

const FIXTURES = path.join(__dirname, "..", "..", "..", "fixtures");
const visible = { visible: true };
const sha256 = (datos: string | Buffer) => createHash("sha256").update(datos).digest("hex");
const lineas = (csv: string) => csv.replace(/^﻿/, "").trimEnd().split("\r\n");

/** Abre el menú «Exportar» y devuelve el enlace de la opción. */
async function enlace(page: Page, texto: string): Promise<string> {
  await page.getByText("Exportar ▾").filter(visible).click();
  const a = page
    .getByRole("group", { name: "Exportaciones" })
    .filter(visible)
    .getByRole("link", { name: texto });
  const href = await a.getAttribute("href");
  expect(href).toBeTruthy();
  await page.getByText("Exportar ▾").filter(visible).click();
  return href ?? "";
}

test("exportaciones del fixture de lavado: CSV para i2, GraphML, PDF con hash verificable y por expediente", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await ingresar(page, "auditor");
  await page.getByRole("link", { name: "Nuevo encargo" }).first().click();
  const nombre = unico("Exportación e2e");
  await page.getByLabel("Nombre").fill(nombre);
  await page.getByRole("button", { name: "Crear encargo" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(nombre);
  const modulos = page.getByRole("navigation", { name: "Módulos" });

  await modulos.getByRole("link", { name: "Importación de Excel" }).click();
  await page.getByRole("link", { name: "Nueva importación" }).first().click();
  await page
    .getByLabel(/Archivo de Excel/)
    .setInputFiles(path.join(FIXTURES, "Red_Lavado_Dinero_LDN2024047.xlsx"));
  await page.getByLabel("Fuente").fill("Entrega e2e");
  await page.getByRole("button", { name: "Analizar" }).click();
  await page.getByRole("button", { name: "Confirmar importación" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Red_Lavado_Dinero_LDN2024047.xlsx",
    { timeout: 60_000 },
  );

  await modulos.getByRole("link", { name: "Red de vínculos" }).click();
  await expect(page.getByText("Exportar ▾")).toHaveCount(0);
  await page.getByRole("button", { name: "Generar red" }).click();
  await expect(page.getByLabel("Indicadores")).toBeVisible({ timeout: 60_000 });

  // CSV para i2: 20 entidades y 25 vínculos; los 20 flujos van en eventos.
  const entidades = await page.request.get(await enlace(page, "Entidades (CSV para i2)"));
  expect(entidades.status()).toBe(200);
  const csvEntidades = await entidades.text();
  expect(lineas(csvEntidades)).toHaveLength(21);
  expect(entidades.headers()["x-sigma-sha256"]).toBe(sha256(Buffer.from(await entidades.body())));
  expect(entidades.headers()["content-disposition"]).toMatch(
    /^attachment; filename="RED-[0-9A-F]{8}-entidades\.csv"$/,
  );
  const vinculos = await page.request.get(await enlace(page, "Vínculos (CSV para i2)"));
  expect(lineas(await vinculos.text())).toHaveLength(26);
  const eventos = await page.request.get(await enlace(page, "Eventos (CSV para i2)"));
  expect(lineas(await eventos.text())).toHaveLength(21);

  const especificacion = await page.request.get(
    await enlace(page, "Especificación de importación para i2"),
  );
  const textoEspecificacion = await especificacion.text();
  expect(textoEspecificacion).toContain(
    `entidades.csv: 20 fila(s) · SHA-256 ${sha256(csvEntidades)}`,
  );
  expect(textoEspecificacion).toContain("vinculos.csv: 25 fila(s)");

  const xml = await (
    await page.request.get(await enlace(page, "GraphML (Gephi, yEd, Cytoscape)"))
  ).text();
  expect(xml).toMatch(
    /^<\?xml version="1\.0" encoding="UTF-8"\?>\n<graphml xmlns="http:\/\/graphml\.graphdrawing\.org\/xmlns"/,
  );
  expect(xml.match(/<node /g)).toHaveLength(20);
  expect(xml.match(/<edge /g)).toHaveLength(45);

  // PDF: el hash del pie es el SHA-256 de los datos adjuntos.
  const pdf = await page.request.get(await enlace(page, "Reporte PDF"));
  expect(pdf.headers()["content-type"]).toBe("application/pdf");
  const bytes = new Uint8Array(await pdf.body());
  const datos = await leerDatosAdjuntos(bytes);
  expect(datos).toBeTruthy();
  const hash = sha256(datos ?? "");
  expect(pdf.headers()["x-sigma-sha256"]).toBe(hash);
  const json = JSON.parse(datos ?? "{}") as { entidades: unknown[]; vinculos: unknown[] };
  expect(json.entidades).toHaveLength(20);
  expect(json.vinculos).toHaveLength(25);

  // Por expediente: solo las entidades que aparecen en sus registros.
  await modulos.getByRole("link", { name: "Expedientes" }).click();
  await page.getByRole("link", { name: "Nuevo expediente" }).first().click();
  await page.getByLabel("Identificador").fill("EXP-EXPORTA");
  await page.getByRole("button", { name: "Crear expediente" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("EXP-EXPORTA");
  const expedienteUrl = page.url();

  await modulos.getByRole("link", { name: "Captura manual" }).click();
  await page
    .getByLabel(/^Tipo de documento/)
    .filter(visible)
    .selectOption({ label: "CFDI" });
  await page
    .getByLabel("Expediente", { exact: true })
    .filter(visible)
    .selectOption({ label: "EXP-EXPORTA" });
  await page
    .getByLabel(/^Fuente declarada/)
    .filter(visible)
    .fill("Oficio de la dependencia");
  await page.getByLabel("Número de factura", { exact: true }).filter(visible).fill("F-EXP-1");
  await page.getByLabel("Fecha del documento").filter(visible).fill("2024-02-01");
  await page.getByRole("button", { name: "Agregar involucrado" }).filter(visible).click();
  await page.getByLabel("Nombre del involucrado 1").fill("CONSULTORES RSV SA");
  await page.getByLabel("RFC del involucrado 1").fill("CRS210101BCD");
  await page.getByRole("button", { name: "Guardar captura" }).filter(visible).click();
  await expect(page).toHaveURL(/\/registros\/[0-9a-f-]{36}$/, { timeout: 30_000 });

  await modulos.getByRole("link", { name: "Red de vínculos" }).click();
  await page.getByRole("button", { name: "Generar red" }).filter(visible).click();
  await expect(
    page.getByRole("list", { name: "Generaciones" }).filter(visible).getByRole("listitem"),
  ).toHaveCount(2, { timeout: 60_000 });

  await page.goto(expedienteUrl);
  const delExpediente = await page.request.get(await enlace(page, "Entidades (CSV para i2)"));
  expect(delExpediente.headers()["content-disposition"]).toMatch(
    /filename="EXP-EXPORTA-[0-9A-F]{8}-entidades\.csv"/,
  );
  const filas = lineas(await delExpediente.text());
  expect(filas.length).toBeGreaterThanOrEqual(2);
  expect(filas.length).toBeLessThan(21);
  expect(filas.join("\n")).toContain("CONSULTORES RSV SA");
});

test("lector no exporta la red", async ({ page }) => {
  await ingresar(page, "lector");
  const r = await page.request.get(
    "/encargos/c0000000-0000-4000-8000-000000000001/red/exportar/entidades.csv",
  );
  expect(r.status()).toBe(403);
  await page.goto("/encargos/c0000000-0000-4000-8000-000000000001/red");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Exportar ▾")).toHaveCount(0);
});
