import { defineConfig } from "@playwright/test";

const port = 5200;
const base = process.env.TNL_E2E_BASE || "/";
export default defineConfig({
    testDir: "./e2e",
    testMatch: "accessibility.spec.ts",
    outputDir: "test-results/a11y",
    fullyParallel: false,
    workers: 1,
    timeout: 45_000,
    expect: { timeout: 10_000 },
    reporter: "list",
    use: {
        baseURL: `http://127.0.0.1:${port}${base}`,
        serviceWorkers: "block",
        reducedMotion: "reduce",
        trace: "retain-on-failure",
    },
    webServer: {
        command: "node e2e/fixture-server.mjs",
        env: { TNL_E2E_PORT: String(port), TNL_E2E_BASE: base },
        url: `http://127.0.0.1:${port}${base}`,
        reuseExistingServer: false,
    },
    projects: [
        { name: "desktop-light", use: { viewport: { width: 1440, height: 900 }, colorScheme: "light" } },
        { name: "mobile-light", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "light" } },
        { name: "desktop-dark", use: { viewport: { width: 1440, height: 900 }, colorScheme: "dark" } },
        { name: "mobile-dark", use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, colorScheme: "dark" } },
    ],
});
