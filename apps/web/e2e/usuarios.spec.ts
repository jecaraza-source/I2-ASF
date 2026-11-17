import { expect, test, type Page } from "@playwright/test";
import { ingresar } from "./ayuda";

const sufijo = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function entrar(page: Page, correo: string, contrasena: string) {
  await page.goto("/ingresar");
  await page.getByLabel("Correo").fill(correo);
  await page.getByLabel("Contraseña").fill(contrasena);
  await page.getByRole("button", { name: "Ingresar" }).click();
}
async function salir(page: Page) {
  await page.getByRole("button", { name: "Salir" }).click();
  await expect(page).toHaveURL(/\/ingresar/);
}

test("admin da de alta con contraseña temporal, cambia el rol, da de baja y todo queda en bitácora", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const correo = `nuevo-${sufijo()}@sigma.test`;
  const temporal = "temporal-de-prueba-1";
  const definitiva = "definitiva-de-prueba-2";

  await ingresar(page, "admin");
  await page.getByRole("link", { name: "Usuarios", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Usuarios y accesos");
  const lista = page.getByRole("region", { name: "Usuarios de la organización" });
  await expect(lista.getByRole("row", { name: /admin@sigma\.test/ })).toContainText(
    "Tu propio acceso lo cambia otro administrador.",
  );

  // Alta con contraseña temporal: una contraseña corta se rechaza y el correo no se pierde.
  await page.getByLabel(/Correo del usuario/).fill(correo);
  await page.getByLabel("Rol", { exact: true }).selectOption({ label: "Lector" });
  await page.getByRole("radio", { name: /Contraseña temporal/ }).check();
  await page.getByLabel(/^Contraseña temporal \*/).fill("corta");
  await page.getByRole("button", { name: "Agregar usuario" }).click();
  await expect(page.getByText("Mínimo 12 caracteres", { exact: true })).toBeVisible();
  await expect(page.getByLabel(/Correo del usuario/)).toHaveValue(correo);
  await page.getByLabel(/^Contraseña temporal \*/).fill(temporal);
  await page.getByRole("button", { name: "Agregar usuario" }).click();
  await expect(page.getByText(/Usuario creado\./)).toBeVisible();
  const fila = lista.getByRole("row", { name: new RegExp(correo) });
  await expect(fila).toContainText("Lector");
  await expect(fila).toContainText("Sin primer acceso");

  // Cambio de rol.
  await fila.getByLabel(`Rol de ${correo}`).selectOption({ label: "Auditor" });
  await fila.getByRole("button", { name: `Guardar rol de ${correo}` }).click();
  await expect(fila.getByText("Rol actualizado.")).toBeVisible();

  // El usuario nuevo entra con la temporal y la cambia.
  await salir(page);
  await entrar(page, correo, "contraseña-equivocada");
  await expect(page.getByText("Correo o contraseña incorrectos.")).toBeVisible();
  await entrar(page, correo, temporal);
  await expect(page).toHaveURL(/\/encargos$/);
  await expect(page.getByTestId("rol-activo")).toHaveText("Auditor");
  await expect(page.getByRole("link", { name: "Usuarios", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Mi contraseña" }).click();
  await expect(page.getByRole("heading", { name: "Cambiar mi contraseña" })).toBeVisible();
  await page.getByLabel("Contraseña nueva").fill(definitiva);
  await page.getByLabel("Repite la contraseña").fill(definitiva);
  await page.getByRole("button", { name: "Guardar contraseña" }).click();
  await expect(page).toHaveURL(/\/encargos$/);
  await salir(page);

  // Bitácora de acceso y control de cambios.
  await ingresar(page, "admin");
  await page.goto("/usuarios?vista=accesos");
  const accesos = page.getByRole("region", { name: "Bitácora de acceso" });
  await expect(accesos.getByRole("row", { name: new RegExp(correo) }).first()).toBeVisible();
  await expect(
    accesos.getByRole("row", { name: new RegExp(`${correo}.*Inicio de sesión`) }).first(),
  ).toBeVisible();
  await expect(
    accesos.getByRole("row", { name: new RegExp(`${correo}.*Intento fallido`) }).first(),
  ).toBeVisible();
  await page.getByRole("link", { name: "Control de cambios" }).click();
  const cambios = page.getByRole("region", { name: "Control de cambios" });
  await expect(
    cambios.getByRole("row", { name: new RegExp(`${correo}.*Cambio de rol.*Lector → Auditor`) }),
  ).toContainText("admin@sigma.test");
  await expect(cambios.getByRole("row", { name: new RegExp(`${correo}.*Alta`) })).toBeVisible();

  // Baja: pierde el acceso al instante aunque su contraseña siga siendo válida.
  await page.getByRole("link", { name: "Usuarios", exact: true }).first().click();
  await fila.getByRole("button", { name: `Dar de baja a ${correo}` }).click();
  await expect(fila).toContainText("De baja");
  await salir(page);
  await entrar(page, correo, definitiva);
  await expect(page).toHaveURL(/\/organizacion$/);
});

test("admin invita por correo y la invitación queda pendiente de primer acceso", async ({
  page,
}) => {
  const correo = `invitado-${sufijo()}@sigma.test`;
  await ingresar(page, "admin");
  await page.goto("/usuarios");
  await page.getByLabel(/Correo del usuario/).fill(correo);
  await page.getByRole("button", { name: "Agregar usuario" }).click();
  await expect(page.getByText(/Invitación enviada\./)).toBeVisible({ timeout: 20_000 });
  await expect(
    page
      .getByRole("region", { name: "Usuarios de la organización" })
      .getByRole("row", { name: new RegExp(correo) }),
  ).toContainText("Sin primer acceso");
});

test("auditor y lector no gestionan usuarios", async ({ page }) => {
  await ingresar(page, "auditor");
  await expect(page.getByRole("link", { name: "Usuarios", exact: true })).toHaveCount(0);
  await page.goto("/usuarios");
  await expect(page.getByText(/Solo un administrador de la organización gestiona/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Agregar usuario" })).toHaveCount(0);
});

test("la página de contraseña pide iniciar sesión si no hay sesión ni enlace", async ({ page }) => {
  await page.goto("/acceso/contrasena");
  await expect(page.getByText(/primero inicia sesión/)).toBeVisible();
  await page.goto("/acceso/contrasena#error=access_denied&error_code=otp_expired");
  await expect(page.getByText(/El enlace ya se usó o venció/)).toBeVisible();
});
