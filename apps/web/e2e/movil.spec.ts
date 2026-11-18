import { mkdirSync } from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ingresar } from "./ayuda";

/**
 * La plataforma en un iPhone (390 × 844, táctil): ninguna pantalla se sale a lo ancho, el menú
 * del celular lleva a cada módulo y la accesibilidad no se rompe. Deja capturas para revisarlas.
 */
const ENCARGO = "/encargos/c0000000-0000-4000-8000-000000000001";
/** Encargo de la prueba de carga (CI): 50,000 registros y una red de 5,000 entidades. */
const CARGA = "/encargos/c0000000-0000-4000-8000-0000000000ca";
const CAPTURAS = path.join(__dirname, "..", "capturas-movil");

test.use({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  userAgent:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
});

/** Elementos que se salen por la derecha sin estar dentro de un contenedor que se desplaza. */
async function desbordes(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const ancho = window.innerWidth;
    if (document.documentElement.scrollWidth <= ancho + 1) return [];
    const dentroDeScroll = (el: Element) => {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return true;
      }
      return false;
    };
    const fuera: string[] = [];
    for (const el of Array.from(document.body.querySelectorAll("*"))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.right <= ancho + 1 || dentroDeScroll(el)) continue;
      const clase = (el.getAttribute("class") ?? "").split(/\s+/).slice(0, 6).join(".");
      fuera.push(
        `${el.tagName.toLowerCase()}${clase ? `.${clase}` : ""} → ${Math.round(r.right)}px`,
      );
      if (fuera.length >= 6) break;
    }
    return fuera.length > 0 ? fuera : [`scrollWidth ${document.documentElement.scrollWidth}`];
  });
}

async function revisar(page: Page, ruta: string, nombre: string) {
  await page.goto(ruta);
  await expect(page.locator("main").first()).toBeVisible();
  await page.waitForLoadState("networkidle").catch(() => undefined);
  mkdirSync(CAPTURAS, { recursive: true });
  // Páginas muy largas (la red de carga): solo los primeros 4,000 px.
  const alto = await page.evaluate(() => document.documentElement.scrollHeight);
  const recorte = alto > 4000 ? { clip: { x: 0, y: 0, width: 390, height: 4000 } } : {};
  await page.screenshot({
    path: path.join(CAPTURAS, `${nombre}.png`),
    fullPage: true,
    ...recorte,
  });
  // TEMPORAL (revisión visual de la tarea 16): la captura en el log, en JPEG reducido.
  const jpg = await page.screenshot({
    type: "jpeg",
    quality: 40,
    fullPage: true,
    scale: "css",
    ...recorte,
  });
  console.log(`CAPTURA ${nombre} ${jpg.toString("base64")}`);
  expect(await desbordes(page), `se sale a lo ancho en ${ruta}`).toEqual([]);
}

test("pantallas de lectura en el celular, sin salirse a lo ancho", async ({ page }) => {
  test.setTimeout(300_000);
  await ingresar(page, "auditor");
  const rutas: [string, string][] = [
    ["/encargos", "01-encargos"],
    [ENCARGO, "02-resumen"],
    [`${ENCARGO}/expedientes`, "03-expedientes"],
    [`${ENCARGO}/registros`, "04-registros"],
    [`${ENCARGO}/alertas`, "05-alertas"],
    [`${ENCARGO}/red`, "06-red"],
    [`${ENCARGO}/red/vista`, "07-red-vista"],
    [`${ENCARGO}/hallazgos`, "08-hallazgos"],
    [`${ENCARGO}/analizador`, "09-analizador"],
    [`${ENCARGO}/verificacion`, "10-verificacion"],
    [`${ENCARGO}/validacion`, "11-validacion"],
    [`${ENCARGO}/ingreso/importar`, "12-ingreso"],
    [`${ENCARGO}/ingreso/capturar`, "13-captura"],
    [`${ENCARGO}/importaciones`, "14-importaciones"],
    [`${ENCARGO}/recorridos`, "15-recorridos"],
    ["/campo", "16-campo"],
  ];
  if (process.env.CI) {
    rutas.push(
      [CARGA, "20-carga-resumen"],
      [`${CARGA}/registros`, "21-carga-registros"],
      [`${CARGA}/expedientes/d0000000-0000-4000-8000-0000000000ca`, "22-carga-expediente"],
      [`${CARGA}/red`, "23-carga-red"],
      [`${CARGA}/red/vista`, "24-carga-red-vista"],
    );
  }
  for (const [ruta, nombre] of rutas) await revisar(page, ruta, nombre);

  // Detalle de un registro y ficha de una entidad, si el encargo de ejemplo los tiene.
  const conDatos = process.env.CI ? CARGA : ENCARGO;
  await page.goto(`${conDatos}/registros`);
  const registro = page.locator(`th a[href*="/registros/"]`).first();
  if (await registro.count()) {
    await revisar(page, (await registro.getAttribute("href")) ?? ENCARGO, "17-registro");
  }
  await page.goto(`${conDatos}/red`);
  const entidad = page.locator(`a[href*="/entidades/"]`).first();
  if (await entidad.count()) {
    await revisar(page, (await entidad.getAttribute("href")) ?? ENCARGO, "18-ficha");
  }
});

test("menú del celular: abre, lleva al módulo y se cierra", async ({ page }) => {
  await ingresar(page, "auditor");
  await page.goto(ENCARGO);
  // En el celular no se ven la barra lateral ni la zona del usuario.
  await expect(page.getByRole("complementary", { name: "Módulos del encargo" })).toBeHidden();
  await expect(page.getByTestId("organizacion-activa")).toBeHidden();

  await page.getByRole("button", { name: "Menú" }).tap();
  const menu = page.getByRole("dialog", { name: "Menú" });
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("link", { name: "Mi contraseña" })).toBeVisible();
  await menu.getByRole("link", { name: "Alertas", exact: true }).tap();
  await expect(page).toHaveURL(new RegExp(`${ENCARGO}/alertas$`));
  await expect(menu).toBeHidden();

  // Escape cierra y el foco vuelve al botón.
  await page.getByRole("button", { name: "Menú" }).click();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
  await expect(page.getByRole("button", { name: "Menú" })).toBeFocused();
});

test("accesibilidad en el celular", async ({ page }) => {
  test.setTimeout(180_000);
  await ingresar(page, "admin");
  for (const ruta of [ENCARGO, `${ENCARGO}/registros`, `${ENCARGO}/alertas`, "/ia"]) {
    await page.goto(ruta);
    await expect(page.locator("main").first()).toBeVisible();
    const r = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .exclude("canvas")
      .analyze();
    const graves = r.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(
      graves.map(
        (v) =>
          `${v.id}: ${v.nodes
            .map((n) => n.target.join(" "))
            .slice(0, 3)
            .join(" | ")}`,
      ),
      `accesibilidad en ${ruta}`,
    ).toEqual([]);
  }
  // El menú abierto también.
  await page.getByRole("button", { name: "Menú" }).click();
  await expect(page.getByRole("dialog", { name: "Menú" })).toBeVisible();
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(r.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);
});
