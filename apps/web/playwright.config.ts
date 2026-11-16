import { defineConfig, devices } from "@playwright/test";

const puerto = 3000;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    baseURL: `http://localhost:${puerto}`,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // En CI se prueba el build de producción; en local, el servidor de desarrollo.
    command: process.env.CI ? "pnpm start" : "pnpm dev",
    url: `http://localhost:${puerto}/ingresar`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
