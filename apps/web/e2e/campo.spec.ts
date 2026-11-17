import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { ingresar, unico } from "./ayuda";

const FIXTURES = path.join(__dirname, "..", "..", "..", "fixtures");
const FOTO = path.join(__dirname, "..", "public", "marca", "escudo.png");

async function modulo(page: Page, nombre: string) {
  await page
    .getByRole("navigation", { name: "Módulos" })
    .getByRole("link", { name: nombre })
    .click();
}

async function procesarTrabajos(page: Page) {
  if (!process.env.CRON_SECRET) return;
  await page.request.get("/api/trabajos/procesar", {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
    timeout: 30_000,
  });
}

test("verificación en campo: visita programada desde la red, cédula sin señal, envío al reconectar y alerta R12", async ({
  page,
  context,
}) => {
  test.setTimeout(240_000);
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 19.4326, longitude: -99.1332, accuracy: 12 });
  await ingresar(page, "admin");

  // Encargo con la red de lavado: la propuesta sale de los proveedores crítico y alto.
  await page.getByRole("link", { name: "Nuevo encargo" }).first().click();
  const nombre = unico("Campo e2e");
  await page.getByLabel("Nombre").fill(nombre);
  await page.getByRole("button", { name: "Crear encargo" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(nombre);
  const encargoUrl = page.url();
  await modulo(page, "Importación de Excel");
  await page.getByRole("link", { name: "Nueva importación" }).first().click();
  await page
    .getByLabel(/Archivo de Excel/)
    .setInputFiles(path.join(FIXTURES, "Red_Lavado_Dinero_LDN2024047.xlsx"));
  await page.getByLabel("Fuente").fill("Entrega e2e");
  await page.getByRole("button", { name: "Analizar" }).click();
  await page.getByRole("button", { name: "Confirmar importación" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Red_Lavado_Dinero_LDN2024047.xlsx",
    { timeout: 90_000 },
  );
  await modulo(page, "Red de vínculos");
  await page.getByRole("button", { name: "Generar red" }).click();
  await expect(page.getByLabel("Indicadores")).toBeVisible({ timeout: 60_000 });

  // Programa de trabajo: los críticos vienen marcados; se visita solo a PROVEEDORA ALPHA SC.
  await page.goto(`${encargoUrl}/verificacion`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Verificación en campo");
  const programa = page.getByRole("group", { name: /Proveedores a visitar/ });
  await expect(programa.getByRole("checkbox")).toHaveCount(11);
  for (const critico of [
    "ATLANTIC TRADE PANAMA",
    "GOLDEN GATE LTD SUIZA",
    "INVERSIONES AURORA BVI",
  ]) {
    await programa.getByRole("checkbox", { name: new RegExp(critico) }).uncheck();
  }
  await programa.getByRole("checkbox", { name: /PROVEEDORA ALPHA SC/ }).check();
  await page
    .getByLabel(/Quién hace la visita/)
    .selectOption({ label: "admin@sigma.test · Administrador" });
  await page
    .getByLabel("Instrucciones para la visita")
    .fill("Fotografía la fachada y el número exterior.");
  await page.getByRole("button", { name: "Asignar visitas" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Se asignó 1 visita." })).toBeVisible();
  const visitas = page.getByRole("list", { name: "Visitas del encargo" });
  await expect(visitas.getByRole("listitem")).toHaveCount(1);
  await expect(visitas).toContainText("PROVEEDORA ALPHA SC");
  await expect(visitas).toContainText("Asignada");
  // Ya no se propone de nuevo.
  await expect(programa.getByRole("checkbox")).toHaveCount(10);

  // App de campo: primero el aviso de confidencialidad.
  await page.goto("/campo");
  await expect(page.getByRole("heading", { name: /Aviso de confidencialidad/ })).toBeVisible();
  const acepto = page.getByRole("button", { name: "Acepto" });
  await expect(acepto).toBeDisabled();
  await page.getByLabel("Leí el aviso y me obligo a cumplirlo.").check();
  await acepto.click();
  await expect(page.getByRole("heading", { name: "Mis visitas" })).toBeVisible();
  await page.getByRole("button", { name: /PROVEEDORA ALPHA SC/ }).click();
  await expect(page.getByRole("heading", { name: /Cédula de verificación/ })).toBeVisible();
  await expect(page.getByText("Fotografía la fachada y el número exterior.")).toBeVisible();

  // Sin señal: la cédula y la foto se guardan en el teléfono.
  await context.setOffline(true);
  await expect(page.getByTestId("conexion")).toContainText("Sin conexión");
  await page.getByRole("button", { name: "Mostrar aviso de privacidad a quien atiende" }).click();
  await expect(page.getByText("Aviso de privacidad simplificado", { exact: true })).toBeVisible();
  const respuestas: Record<string, string> = {
    "¿El domicilio declarado existe": "No",
    "¿Hay un inmueble": "No",
    "¿El proveedor está establecido": "No se pudo verificar",
    "¿Hay actividad visible": "No se pudo verificar",
    "¿Alguien en el sitio": "No se pudo verificar",
  };
  const grupos = page.getByRole("group");
  for (const [pregunta, respuesta] of Object.entries(respuestas)) {
    await grupos
      .filter({ hasText: pregunta })
      .getByRole("radio", { name: respuesta, exact: true })
      .check();
  }
  await page.getByLabel("Domicilio observado").fill("Lote baldío, sin número exterior");
  await page.getByLabel("Observaciones").fill("Vecinos no reconocen a la empresa.");
  await page.getByLabel(/Fotos del lugar/).setInputFiles(FOTO);
  await expect(page.getByRole("list", { name: "Fotos tomadas" }).getByRole("listitem")).toHaveCount(
    1,
  );
  await expect(page.getByRole("list", { name: "Fotos tomadas" })).toContainText("Con ubicación");
  await page.getByRole("button", { name: "Guardar cédula" }).click();
  await expect(page.getByText("Se enviará al volver la señal.")).toBeVisible();
  await expect(page.getByTestId("pendientes")).toContainText("1 por enviar");
  await expect(page.getByRole("region", { name: "Cédulas por enviar" })).toContainText(
    "PROVEEDORA ALPHA SC",
  );

  // Vuelve la señal: se envía sola.
  await context.setOffline(false);
  await expect(page.getByTestId("conexion")).toContainText("Con conexión");
  await expect(page.getByTestId("pendientes")).toHaveText("Nada por enviar", { timeout: 60_000 });
  await expect(page.getByText("Se envió 1 cédula.")).toBeVisible();
  await expect(page.getByText("No tienes visitas por hacer.")).toBeVisible();

  // El auditor ve la visita verificada con su foto sellada.
  await page.goto(`${encargoUrl}/verificacion`);
  await expect(visitas).toContainText("Verificada");
  await expect(visitas).toContainText("Lote baldío, sin número exterior");
  await expect(visitas.getByText(/SHA-256 [0-9a-f]{12}…/)).toBeVisible();
  await expect(visitas.getByRole("img", { name: /Foto 1 de PROVEEDORA ALPHA SC/ })).toBeVisible();

  // Cada «no» es una alerta R12, no un hallazgo.
  const lista = page.getByRole("list", { name: "Alertas" });
  await expect(async () => {
    await procesarTrabajos(page);
    await page.goto(`${encargoUrl}/alertas`);
    await expect(
      lista.getByRole("link", {
        name: "PROVEEDORA ALPHA SC: el domicilio declarado no existe o no se localizó",
      }),
    ).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 90_000 });
  await expect(
    lista.getByRole("link", {
      name: "PROVEEDORA ALPHA SC: no existe un inmueble en el domicilio declarado",
    }),
  ).toBeVisible();
  await expect(lista.getByRole("link", { name: /^PROVEEDORA ALPHA SC:/ })).toHaveCount(2);
});
