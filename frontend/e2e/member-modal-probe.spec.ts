import { test, expect, type Page } from "@playwright/test";

// Member profile modal probe: opens a member modal on /member at desktop and
// mobile widths, screenshots both, and verifies Escape closes it.
const shots = "e2e/__screenshots__/member-modal-probe";

async function openMemberModal(page: Page, viewport: { width: number; height: number }) {
  await page.setViewportSize(viewport);
  // Harness mode: the real MemberSections component against stubbed CMS data —
  // deterministic offline (the live /member route needs a running backend).
  await page.goto("/geom.html?only=member-modal", { waitUntil: "domcontentloaded" });
  // Wait for member cards to hydrate.
  await page.waitForSelector(".member-profile-action", { timeout: 30000 });
  // Dismiss the announcement popup if it appeared over the page.
  const announcement = page.getByTestId("announcement-popup");
  if (await announcement.isVisible({ timeout: 1500 }).catch(() => false)) {
    await page.keyboard.press("Escape");
    await expect(announcement).not.toBeVisible();
  }
  const trigger = page.locator(".member-profile-action").first();
  await trigger.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  return { trigger, dialog };
}

test("member modal at 1440 and 390 with Escape close", async ({ page }) => {
  // Desktop
  const desktop = await openMemberModal(page, { width: 1440, height: 900 });
  await expect(desktop.dialog.locator("[data-testid='member-profile-body']")).toBeVisible();
  await page.screenshot({ path: `${shots}/member-modal-1440.png`, fullPage: false });
  const overflowDuring = await page.evaluate(() => document.body.style.overflow);
  expect(overflowDuring).toBe("hidden");
  await page.keyboard.press("Escape");
  await expect(desktop.dialog).not.toBeVisible();
  // Exit animation delays the unmount that restores body overflow — poll for it.
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow), { timeout: 5000 })
    .toBe("");
  expect(await desktop.trigger.evaluate((el: HTMLElement) => el === document.activeElement)).toBe(true);

  // Mobile
  const mobile = await openMemberModal(page, { width: 390, height: 844 });
  await expect(mobile.dialog.locator("[data-testid='member-profile-body']")).toBeVisible();
  // Body scrolls, dialog never wider than the viewport.
  const box = (await mobile.dialog.boundingBox())!;
  expect(box.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: `${shots}/member-modal-390.png`, fullPage: false });
  await page.keyboard.press("Escape");
  await expect(mobile.dialog).not.toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.body.style.overflow), { timeout: 5000 })
    .toBe("");
  expect(await mobile.trigger.evaluate((el: HTMLElement) => el === document.activeElement)).toBe(true);
});
