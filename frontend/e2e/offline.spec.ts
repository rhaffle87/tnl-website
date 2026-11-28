import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function control(page: Page) {
    await page.goto("");
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
}

test("public navigation gets a usable offline shell, then recovers online", async ({ page, context, baseURL }) => {
    await control(page);
    const manifest = await page.locator('link[rel="manifest"]').getAttribute("href");
    expect(manifest).toBeTruthy();
    const definition = await (await page.request.get(new URL(manifest!, baseURL).href)).json();
    expect(definition.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual(["192x192", "512x512"]);
    await context.setOffline(true);
    for (const route of ["", "member", "activity", "news", "publications", "contact", "terms", "privacy"]) {
        const response = await page.goto(route);
        expect(response?.fromServiceWorker()).toBe(true);
        await expect(page.getByRole("heading", { name: "Halaman belum tersedia" })).toBeVisible();
        await expect(page.getByText("PRIVATE_API_SENTINEL")).toHaveCount(0);
    }
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations).toEqual([]);
    await page.keyboard.press("Tab");
    await expect(page.getByRole("link", { name: "Muat ulang / Reload page" })).toBeFocused();
    await context.setOffline(false);
    await page.goto("");
    await expect(page.getByTestId("home-page")).toBeVisible();
});

test("no API, auth, admin, upload or private media cache, and no mutation replay", async ({ page, context }) => {
    await control(page);
    const excluded = ["api/public/settings", "api/auth/me", "api/admin/inbox", "uploads/private.pdf?signature=fixture", "media/private.jpg", "private-media/person.png"];
    for (const path of excluded) {
        expect(await page.evaluate(async (path) => (await fetch(path)).ok, path)).toBe(true);
    }
    const before = await page.evaluate(async () => (await (await fetch("__fixtures/mutations")).json()).mutations);
    await context.setOffline(true);
    for (const path of excluded) {
        expect(await page.evaluate(async (path) => { try { await fetch(path); return false; } catch { return true; } }, path), path).toBe(true);
    }
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
        expect(await page.evaluate(async (method) => {
            try { await fetch("api/contact", { method, body: "fixture" }); return false; } catch { return true; }
        }, method)).toBe(true);
    }
    const cachePaths = await page.evaluate(async () => {
        const keys = await caches.keys();
        return (await Promise.all(keys.map(async (key) => (await (await caches.open(key)).keys()).map((request) => new URL(request.url).pathname)))).flat();
    });
    expect(cachePaths.length).toBeGreaterThan(0);
    expect(cachePaths.every((path) => /\/(offline\.html|site\.webmanifest)$/.test(path)), JSON.stringify(cachePaths)).toBe(true);
    for (const path of ["admin", "admin/login", "admin/invite/token", "auth/callback", "verify/private-code", "open-house", "p/private-preview", "news?token=fixture"]) {
        const tab = await context.newPage();
        await expect(tab.goto(path), path).rejects.toThrow();
        await tab.close();
    }
    await context.setOffline(false);
    const after = await page.evaluate(async () => (await (await fetch("__fixtures/mutations")).json()).mutations);
    expect(after).toBe(before);
});

test("updates wait without replacing the active worker or reloading a page", async ({ page }) => {
    await control(page);
    const original = await page.evaluate(() => navigator.serviceWorker.controller!.scriptURL);
    await page.evaluate(async () => {
        await navigator.serviceWorker.register(new URL("sw.js?fixture-version=2", location.href), { scope: new URL(".", location.href).pathname });
    });
    await expect.poll(() => page.evaluate(async () => Boolean((await navigator.serviceWorker.getRegistration())?.waiting))).toBe(true);
    expect(await page.evaluate(() => navigator.serviceWorker.controller!.scriptURL)).toBe(original);
    await expect(page.getByTestId("home-page")).toBeVisible();
});
