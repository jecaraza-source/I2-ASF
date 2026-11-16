import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { CONTRASENA, USUARIOS, ingresar } from "./ayuda";

const ORGANIZACION = "b0000000-0000-4000-8000-000000000001";
const ENCARGO = "c0000000-0000-4000-8000-000000000001";

test("lector ve encargos y expedientes sin botones de alta", async ({ page }) => {
  await ingresar(page, "lector");
  await expect(page.getByTestId("rol-activo")).toHaveText("Lector");
  await expect(page.getByRole("link", { name: "Encargo de prueba" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Nuevo encargo" })).toHaveCount(0);

  await page.getByRole("link", { name: "Encargo de prueba" }).click();
  await expect(page.getByRole("link", { name: "Editar encargo" })).toHaveCount(0);
  await page
    .getByRole("navigation", { name: "Módulos" })
    .getByRole("link", { name: "Expedientes" })
    .click();
  await expect(page.getByRole("link", { name: "Nuevo expediente" })).toHaveCount(0);
});

test("lector que entra directo al alta ve que no tiene permiso", async ({ page }) => {
  await ingresar(page, "lector");
  await page.goto("/encargos/nuevo");
  await expect(page.getByRole("alert").filter({ hasText: "Tu rol no permite" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Crear encargo" })).toHaveCount(0);

  await page.goto(`/encargos/${ENCARGO}/expedientes/nuevo`);
  await expect(page.getByRole("alert").filter({ hasText: "Tu rol no permite" })).toBeVisible();
});

test("el servidor rechaza mutaciones del lector aunque se salte la interfaz", async () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  test.skip(!url || !clave, "Requiere las variables de Supabase");
  const supabase = createClient(url!, clave!, { auth: { persistSession: false } });
  const { error: errorIngreso } = await supabase.auth.signInWithPassword({
    email: USUARIOS.lector,
    password: CONTRASENA,
  });
  expect(errorIngreso).toBeNull();

  const encargo = await supabase
    .from("encargo")
    .insert({ organizacion_id: ORGANIZACION, nombre: "intento del lector" })
    .select("id");
  expect(encargo.error?.code).toBe("42501");

  const expediente = await supabase
    .from("expediente")
    .insert({ organizacion_id: ORGANIZACION, encargo_id: ENCARGO, identificador: "" })
    .select("id");
  expect(expediente.error?.code).toBe("42501");

  const cambio = await supabase
    .from("encargo")
    .update({ nombre: "alterado" })
    .eq("id", ENCARGO)
    .select("id");
  expect(cambio.data ?? []).toHaveLength(0);
});
