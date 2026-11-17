import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { ingresar, unico } from "./ayuda";

const PROVEEDOR = "=SUMA PROVEEDOR DOC SA DE CV";

async function capturar(
  page: Page,
  datos: {
    tipo: string;
    expediente?: string;
    numero: [string, string];
    fecha: string;
    monto?: string;
    involucrados: { tipo?: string; nombre: string; rol?: string; rfc?: string }[];
  },
) {
  const visible = { visible: true };
  await page
    .getByLabel(/^Tipo de documento/)
    .filter(visible)
    .selectOption({ label: datos.tipo });
  if (datos.expediente) {
    await page
      .getByLabel("Expediente", { exact: true })
      .filter(visible)
      .selectOption({ label: datos.expediente });
  }
  await page
    .getByLabel(/^Fuente declarada/)
    .filter(visible)
    .fill("Oficio de la dependencia");
  await page.getByLabel(datos.numero[0], { exact: true }).filter(visible).fill(datos.numero[1]);
  await page.getByLabel("Fecha del documento").filter(visible).fill(datos.fecha);
  if (datos.monto)
    await page.getByLabel("Monto", { exact: true }).filter(visible).fill(datos.monto);
  for (const [i, inv] of datos.involucrados.entries()) {
    const n = i + 1;
    await page.getByRole("button", { name: "Agregar involucrado" }).filter(visible).click();
    if (inv.tipo)
      await page.getByLabel(`Tipo del involucrado ${n}`).selectOption({ label: inv.tipo });
    await page.getByLabel(`Nombre del involucrado ${n}`).fill(inv.nombre);
    if (inv.rol) await page.getByLabel(`Rol del involucrado ${n}`).selectOption({ label: inv.rol });
    if (inv.rfc) await page.getByLabel(`RFC del involucrado ${n}`).fill(inv.rfc);
  }
  await page.getByRole("button", { name: "Guardar captura" }).filter(visible).click();
  // Al guardar se abre el registro creado.
  await expect(page).toHaveURL(/\/registros\/[0-9a-f-]{36}$/, { timeout: 30_000 });
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(new RegExp(datos.numero[1]));
}

test("expediente documental: filtra por entidad y por categoría, cambia de vista, abre un registro hasta su documento y exporta", async ({
  page,
}) => {
  test.setTimeout(240_000);
  await ingresar(page, "auditor");
  await page.getByRole("link", { name: "Nuevo encargo" }).first().click();
  const encargo = unico("Documental e2e");
  await page.getByLabel("Nombre").fill(encargo);
  await page.getByRole("button", { name: "Crear encargo" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(encargo);
  const modulos = page.getByRole("navigation", { name: "Módulos" });

  // Un documento pendiente en EXP-DOC.
  await modulos.getByRole("link", { name: "Ingreso de documentos" }).click();
  await expect(page).toHaveURL(/\/ingreso\/importar/);
  await page.getByLabel("Tipo de documento del lote").selectOption({ label: "Contrato" });
  await page
    .getByLabel("Expediente del lote", { exact: true })
    .selectOption({ label: "Nuevo expediente…" });
  await page.getByLabel("Identificador del expediente nuevo del lote").fill("EXP-DOC");
  await page.getByLabel("Fuente del lote").fill("Entrega física");
  await expect(async () => {
    await page.getByLabel("Archivos", { exact: true }).setInputFiles([
      {
        name: "contrato-doc.pdf",
        mimeType: "application/pdf",
        buffer: Buffer.from(`%PDF-1.4\n% ${unico("doc")}\n%%EOF\n`),
      },
    ]);
    await expect(page.getByRole("button", { name: /Subir 1 documento/ })).toBeEnabled({
      timeout: 2_000,
    });
  }).toPass({ timeout: 30_000 });
  await page.getByRole("button", { name: /Subir 1 documento/ }).click();
  await expect(page.getByTestId("aviso-ingreso")).toHaveText("1 de 1 documento(s) registrados.", {
    timeout: 60_000,
  });

  // Dos capturas: un contrato en EXP-DOC y un CFDI sin expediente, del mismo proveedor.
  await modulos.getByRole("link", { name: "Captura manual" }).click();
  await expect(page).toHaveURL(/\/ingreso\/capturar/);
  await capturar(page, {
    tipo: "Contrato",
    expediente: "EXP-DOC",
    numero: ["Número de contrato", "CTR-DOC-1"],
    fecha: "2022-03-15",
    monto: "1,000.00",
    involucrados: [
      { tipo: "Dependencia", nombre: "SECRETARÍA DOC E2E", rol: "Dependencia contratante" },
      { nombre: PROVEEDOR, rfc: "SPD200101AB1" },
    ],
  });
  await modulos.getByRole("link", { name: "Captura manual" }).click();
  await expect(page).toHaveURL(/\/ingreso\/capturar/);
  // Al volver, el formulario está vacío: no arrastra la captura anterior.
  await expect(page.getByLabel(/^Tipo de documento/).filter({ visible: true })).toHaveValue("");
  await expect(page.getByLabel("Nombre del involucrado 1")).toHaveCount(0);
  await capturar(page, {
    tipo: "CFDI",
    numero: ["Número de factura", "F-DOC-9"],
    fecha: "2022-05-02",
    involucrados: [{ nombre: PROVEEDOR, rfc: "SPD200101AB1" }],
  });

  // Página del expediente: dos registros (el documento pendiente y el contrato).
  await modulos.getByRole("link", { name: "Expedientes" }).click();
  await page.getByRole("link", { name: "EXP-DOC" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("EXP-DOC");
  // Next conserva ocultas las páginas visitadas: todo se busca en lo visible.
  const visible = { visible: true };
  const resumen = page.getByTestId("resumen-documental").filter(visible);
  await expect(resumen).toHaveText(/^2 registro\(s\)/);
  const arbol = page.getByRole("navigation", { name: "Árbol del encargo" }).filter(visible);
  await expect(arbol.getByRole("link", { name: /^EXP-DOC/ })).toContainText("2");
  await expect(arbol.getByRole("link", { name: /^Sin expediente/ })).toContainText("1");
  const tabla = page.getByRole("table", { name: "Registros" }).filter(visible);
  await expect(tabla.getByRole("row", { name: /CTR-DOC-1/ })).toContainText("1,000.00");
  await expect(tabla.getByRole("row", { name: /CTR-DOC-1/ })).toContainText("SPD200101AB1");
  await expect(tabla.getByRole("row", { name: /contrato-doc\.pdf/ })).toContainText("Pendiente");

  // Filtro de estado: solo validados.
  await page.getByLabel("Estado").filter(visible).selectOption({ label: "Validados" });
  await page.getByRole("button", { name: "Filtrar" }).filter(visible).click();
  await expect(resumen).toHaveText(/^1 registro\(s\)/);
  await page.getByRole("link", { name: "Quitar filtros" }).filter(visible).click();
  await expect(resumen).toHaveText(/^2 registro\(s\)/);

  // Por entidad dentro del expediente, luego su categoría; los conteos del árbol cuadran.
  await arbol.getByRole("link", { name: /^=SUMA PROVEEDOR DOC/ }).click();
  await expect(resumen).toHaveText(/^1 registro\(s\) de =SUMA PROVEEDOR DOC SA DE CV/);
  await arbol.getByRole("link", { name: /^Contractual/ }).click();
  await expect(resumen).toHaveText(/^1 registro\(s\)/);
  await expect(arbol.getByRole("link", { name: /^Contractual/ })).toHaveAttribute(
    "aria-current",
    "page",
  );

  // La entidad en todos los expedientes del encargo.
  await page.getByRole("link", { name: "quitar categoría" }).filter(visible).click();
  await page.getByRole("link", { name: "ver en todos los expedientes" }).filter(visible).click();
  await expect(page).toHaveURL(/\/registros\?vista=entidad&entidad=/);
  await expect(resumen).toHaveText(/^2 registro\(s\) de =SUMA PROVEEDOR DOC SA DE CV/);
  await expect(page.getByRole("link", { name: "Por entidad" }).filter(visible)).toHaveAttribute(
    "aria-current",
    "page",
  );

  // Por categoría: grupos de Contractual y Fiscal en todo el encargo.
  await page.goto(page.url().replace(/\/registros\?.*$/, "/registros"));
  await page.getByRole("link", { name: "Por categoría" }).filter(visible).click();
  await expect(tabla.getByRole("rowheader", { name: /^Contractual · 2/ })).toBeVisible();
  await expect(tabla.getByRole("rowheader", { name: /^Fiscal · 1/ })).toBeVisible();

  // Línea de tiempo: de lo más antiguo a lo más reciente, por mes; lo que no tiene fecha al final.
  await page.getByRole("link", { name: "Línea de tiempo" }).filter(visible).click();
  const grupos = tabla.locator("th[scope=rowgroup]");
  await expect(grupos).toHaveText([/^marzo de 2022/, /^mayo de 2022/, /^Sin fecha/]);

  // El nodo «Sin expediente» cuenta lo mismo que la tabla al elegirlo.
  await arbol.getByRole("link", { name: /^Sin expediente/ }).click();
  await expect(resumen).toHaveText(/^1 registro\(s\)/);
  await expect(tabla.getByRole("row", { name: /F-DOC-9/ })).toBeVisible();

  // Detalle de un registro: lo que generó y su bitácora.
  await page.getByRole("link", { name: "Por expediente" }).filter(visible).click();
  await arbol.getByRole("link", { name: /^EXP-DOC/ }).click();
  await tabla.getByRole("link", { name: /^Contrato CTR-DOC-1/ }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Contrato CTR-DOC-1/);
  await expect(
    page.getByRole("region", { name: "Eventos generados" }).filter(visible),
  ).toContainText("contrato");
  await expect(
    page.getByRole("region", { name: "Bitácora del registro" }).filter(visible),
  ).toContainText("Alta del registro");
  await page.getByRole("link", { name: "EXP-DOC" }).filter(visible).first().click();

  // Del registro del documento hasta el original.
  await tabla.getByRole("link", { name: "contrato-doc.pdf" }).first().click();
  await expect(page).toHaveURL(/\/registros\//);
  await page.getByRole("link", { name: "contrato-doc.pdf" }).filter(visible).click();
  await expect(page).toHaveURL(/\/documentos\//);
  await expect(page.getByTitle("Original: contrato-doc.pdf").filter(visible)).toBeVisible();

  // Exportar la vista del expediente: dos filas y las fórmulas neutralizadas.
  await page.goBack();
  await page.getByRole("link", { name: "EXP-DOC" }).filter(visible).first().click();
  await expect(resumen).toHaveText(/^2 registro\(s\)/);
  const [descarga] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Exportar CSV" }).filter(visible).click(),
  ]);
  const csv = readFileSync(await descarga.path(), "utf8");
  const lineas = csv.replace(/^﻿/, "").trimEnd().split("\r\n");
  expect(lineas[0]).toMatch(/^Registro,Folio,Expediente,/);
  expect(lineas).toHaveLength(3);
  expect(csv).toContain(`'${PROVEEDOR} (proveedor)`);
  expect(csv).not.toMatch(/(^|,)=SUMA/m);
});

test("el lector no exporta", async ({ page }) => {
  await ingresar(page, "lector");
  const r = await page.request.get(
    "/encargos/c0000000-0000-4000-8000-000000000001/registros/exportar",
  );
  expect(r.status()).toBe(403);
  await page.goto("/encargos/c0000000-0000-4000-8000-000000000001/registros");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Registros del encargo");
  await expect(page.getByRole("link", { name: "Exportar CSV" })).toHaveCount(0);
});
