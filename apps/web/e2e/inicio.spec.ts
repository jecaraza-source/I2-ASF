import { expect, test } from "@playwright/test";

test("la página de inicio muestra el logo y el nombre de la plataforma", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("SIGMA");
  await expect(page.getByRole("img", { name: /logo/i })).toBeVisible();
});
