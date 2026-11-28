import { defineConfig } from "@playwright/test";

const port = 5201;
const base = process.env.TNL_E2E_BASE || "/";
export default defineConfig({
    testDir: "./e2e",
    testMatch: "offline.spec.ts",
    outputDir: "test-results/pwa",
    workers: 1,
    timeout: 45_000,
    expect: { timeout: 10_000 },
    reporter: "list",
    use: { baseURL: `http://127.0.0.1:${port}${base}`, serviceWorkers: "allow", trace: "retain-on-failure" },
    webServer: {
        command: "node e2e/fixture-server.mjs",
        env: { TNL_E2E_PORT: String(port), TNL_E2E_BASE: base },
        url: `http://127.0.0.1:${port}${base}`,
        reuseExistingServer: false,
    },
    projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
