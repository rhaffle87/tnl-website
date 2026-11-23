import { defineConfig } from "@playwright/test";

/**
 * Geometry gate for layout-only regressions (jsdom cannot measure boxes).
 *
 * The specs load the dev-only harness pages that mount the real components
 * against a stubbed backend:
 *   /geom.html?only=media                     widescreen media picker
 *   /geom.html?only=announcement              blocking announcement modal
 *   /geom.html?only=announcement&style=card   non-blocking corner card
 */
const PORT = 5199; // keep in sync with the harness docs above; CI reuses this port
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
    testDir: "./e2e",
    fullyParallel: false,
    workers: 1,
    timeout: 45_000,
    expect: { timeout: 10_000 },
    reporter: [["list"]],
    use: {
        baseURL: BASE_URL,
        trace: "off",
    },
    webServer: {
        command: `npm run dev -- --port ${PORT} --strictPort --host 127.0.0.1`,
        url: `${BASE_URL}/geom.html`,
        reuseExistingServer: true,
        timeout: 120_000,
    },
    projects: [
        {
            name: "desktop",
            use: { viewport: { width: 1440, height: 900 } },
        },
        {
            name: "mobile",
            use: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true },
        },
    ],
});
