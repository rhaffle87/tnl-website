import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function audit(page: Page) {
    const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
    expect(result.violations, JSON.stringify(result.violations, null, 2)).toEqual([]);
}

test.beforeEach(async ({ context, page, baseURL }) => {
    await context.route(/^https?:\/\//, (route) =>
        new URL(route.request().url()).origin === new URL(baseURL!).origin ? route.continue() : route.abort(),
    );
    await page.addInitScript(() => localStorage.setItem("tnl-locale", "en"));
});

for (const [path, ready] of [["", "home-page"], ["member", "member-page"], ["news", "news-page"], ["contact", "contact-page"]]) {
    test(`public ${path || "home"}: WCAG A/AA`, async ({ page }) => {
        await page.goto(path);
        await expect(page.getByTestId(ready)).toBeVisible();
        if (path === "member") await expect(page.locator(".member-profile-action").first()).toBeVisible();
        if (path === "news") await expect(page.getByTestId("news-card-fixture-news")).toBeVisible();
        await expect(page.getByRole("main")).toHaveCount(1);
        await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
        await audit(page);
    });
}

test("admin sign-in: labels, keyboard submission and rejection feedback", async ({ page }) => {
    await page.goto("admin/login");
    const email = page.getByLabel("Email address", { exact: true });
    await expect(email).toBeVisible();
    await email.focus();
    await page.keyboard.type("fixture@example.test");
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Password", { exact: true })).toBeFocused();
    await page.keyboard.type("fixture-invalid-password");
    await page.keyboard.press("Enter");
    await expect(page.getByTestId("login-error")).toContainText("Fixture sign-in rejected");
    await audit(page);
});

test("member dialog: keyboard entry, focus containment, Escape and focus return", async ({ page }) => {
    await page.goto("member");
    const trigger = page.locator(".member-profile-action").first();
    await expect(trigger).toBeVisible();
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Accessibility Test Member" });
    await expect(dialog).toBeVisible();
    const close = page.getByTestId("member-modal-close-button");
    await expect(close).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Tab");
    await expect(close).toBeFocused();
    await audit(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
});

test("mobile navigation: keyboard dialog and focus restoration", async ({ page }, testInfo) => {
    test.skip(!testInfo.project.name.startsWith("mobile"), "Mobile navigation is hidden on desktop");
    await page.goto("");
    const trigger = page.getByTestId("mobile-menu-button");
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog", { name: "Navigation" });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Close" })).toBeFocused();
    await audit(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
});
