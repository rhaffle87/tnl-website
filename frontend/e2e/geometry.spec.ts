import { expect, test } from "@playwright/test";

/**
 * Layout gates. Every assertion is measured in a real layout engine — the
 * crushed media picker (Image 4) was invisible to jsdom because jsdom reports
 * zero-size boxes for everything.
 *
 * Sizes are read from offsetWidth/offsetHeight (layout truth, immune to any
 * ancestor transform), and containment compares a child's rect against the
 * modal's rect — both scale together, so the comparison holds either way.
 */

type Box = { x: number; y: number; w: number; h: number; right: number; bottom: number };

async function settle(page: import("@playwright/test").Page) {
    // Let the enter animation finish so we measure the final box, not a frame.
    await page
        .waitForFunction(() => {
            const modal = document.querySelector('[data-testid="media-picker-modal"]');
            if (!modal) return true;
            const t = getComputedStyle(modal).transform;
            return t === "none" || t.startsWith("matrix(1,") || t.startsWith("matrix3d(1,");
        }, null, { timeout: 4000 })
        .catch(() => undefined);
    await page.waitForTimeout(150);
}

test.beforeEach(async ({ page }) => {
    // Pin the locale so the CMS copy assertions are deterministic.
    await page.addInitScript(() => {
        try {
            localStorage.setItem("tnl-locale", "en");
        } catch {
            /* ignore */
        }
    });
});

test.describe("Media picker geometry", () => {
    test("desktop: widescreen modal, thumbnail cards stay >= 120px, nothing is clipped", async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== "desktop", "desktop project only");
        await page.goto("/geom.html?only=media");
        const modal = page.locator('[data-testid="media-picker-modal"]');
        await expect(modal).toBeVisible();
        await expect(page.locator('[data-testid^="media-item-"]').first()).toBeVisible();
        await settle(page);

        // The picker must be a widescreen browser, not the 384px squashed dialog.
        const layout = await modal.evaluate((el) => ({
            w: (el as HTMLElement).offsetWidth,
            h: (el as HTMLElement).offsetHeight,
            dataSize: el.getAttribute("data-dialog-size"),
            scrollW: el.scrollWidth,
            clientW: el.clientWidth,
        }));
        expect(layout.dataSize).toBe("media");
        expect(layout.w).toBeGreaterThanOrEqual(960);
        expect(layout.h).toBeGreaterThanOrEqual(560);
        expect(layout.scrollW).toBeLessThanOrEqual(layout.clientW + 1);

        // Header must stay on one row (it used to fold into two and collide with the close button).
        const header = page.locator('[data-testid="media-picker-modal"] > div').first();
        const headerBox = await header.boundingBox();
        expect(headerBox!.height).toBeLessThanOrEqual(72);

        // Thumbnails keep a real minimum size at every viewport.
        const cards = await page.locator('[data-testid^="media-item-"]').evaluateAll((els) =>
            els.filter((el) => el.getBoundingClientRect().width > 0).map((el) => ({
                w: (el as HTMLElement).offsetWidth,
                h: (el as HTMLElement).offsetHeight,
            }))
        );
        expect(cards.length).toBeGreaterThan(0);
        for (const card of cards) {
            expect(card.w).toBeGreaterThanOrEqual(120);
            expect(card.h).toBeGreaterThanOrEqual(120);
        }

        // Nothing may be pushed outside the modal: inspector + both footers.
        await page.locator('[data-testid="media-item-media-1"]').click();
        await settle(page);

        const containment = await page.evaluate(() => {
            const modalEl = document.querySelector('[data-testid="media-picker-modal"]') as HTMLElement;
            const mb = modalEl.getBoundingClientRect();
            const probe = (selector: string) => {
                const el = document.querySelector(selector) as HTMLElement | null;
                if (!el) return { selector, found: false, inside: false, w: 0 };
                const r = el.getBoundingClientRect();
                return {
                    selector,
                    found: true,
                    w: Math.round(r.width),
                    inside: r.right <= mb.right + 2 && r.bottom <= mb.bottom + 2 && r.width > 0,
                };
            };
            return [
                probe('[data-testid="media-picker-alt-input"]'),
                probe('[data-testid="media-picker-save-alt"]'),
                probe('[data-testid="media-picker-insert-button"]'),
                probe('[data-testid="media-picker-summary"]'),
            ];
        });
        for (const item of containment) {
            expect(item.found, `${item.selector} must exist`).toBe(true);
            expect(item.w, `${item.selector} must have a real width`).toBeGreaterThan(0);
            expect(item.inside, `${item.selector} must sit inside the modal bounds`).toBe(true);
        }

        // The primary action must be reachable and enabled once an asset is picked.
        const insert = page.locator('[data-testid="media-picker-insert-button"]');
        await expect(insert).toBeEnabled();
        await expect(insert).toContainText("Use Selected Image");
        await expect(page.locator('[data-testid="media-picker-summary"]')).toContainText("HFiuWsxaYAAP1.jpg");
    });

    test("desktop: upload tab exposes dropzone, folder, alt and auto-webp switch", async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== "desktop", "desktop project only");
        await page.goto("/geom.html?only=media");
        await page.locator('[data-testid="media-picker-tab-upload"]').click();
        await expect(page.locator('[data-testid="media-picker-dropzone"]')).toBeVisible();
        await expect(page.locator('[data-testid="media-picker-upload-folder"]')).toBeVisible();
        await expect(page.locator('[data-testid="media-picker-upload-alt"]')).toBeVisible();
        await expect(page.locator('[data-testid="media-picker-optimize-check"]')).toBeVisible();
        await expect(page.locator('[data-testid="media-picker-upload-submit"]')).toBeVisible();
    });

    test("mobile: the picker still fits the screen with no horizontal overflow", async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== "mobile", "mobile project only");
        await page.goto("/geom.html?only=media");
        const modal = page.locator('[data-testid="media-picker-modal"]');
        await expect(modal).toBeVisible();
        await expect(page.locator('[data-testid^="media-item-"]').first()).toBeVisible();
        await settle(page);

        const result = await page.evaluate(() => {
            const el = document.querySelector('[data-testid="media-picker-modal"]') as HTMLElement;
            const grid = document.querySelector('[data-testid="media-picker-grid"]') as HTMLElement;
            const cards = [...document.querySelectorAll('[data-testid^="media-item-"]')] as HTMLElement[];
            const r = el.getBoundingClientRect();
            const insert = document.querySelector('[data-testid="media-picker-insert-button"]') as HTMLElement;
            const ib = insert.getBoundingClientRect();
            return {
                viewport: { w: innerWidth, h: innerHeight },
                left: Math.round(r.left),
                right: Math.round(r.right),
                bottom: Math.round(r.bottom),
                gridOverflowsX: grid.scrollWidth > grid.clientWidth + 1,
                modalOverflowsX: el.scrollWidth > el.clientWidth + 1,
                minCardW: cards.length ? Math.min(...cards.map((c) => c.offsetWidth)) : 0,
                insertInside:
                    ib.right <= r.right + 2 && ib.bottom <= r.bottom + 2 && ib.width > 0 && ib.left >= r.left - 2,
            };
        });

        expect(result.left).toBeGreaterThanOrEqual(-1);
        expect(result.right).toBeLessThanOrEqual(result.viewport.w + 1);
        expect(result.bottom).toBeLessThanOrEqual(result.viewport.h + 1);
        expect(result.modalOverflowsX).toBe(false);
        expect(result.gridOverflowsX).toBe(false);
        expect(result.minCardW).toBeGreaterThanOrEqual(120);
        expect(result.insertInside).toBe(true);
    });
});

test.describe("Announcement popup", () => {
    test("modal style: three exit paths, honest CTA label, fits the viewport", async ({ page }) => {
        await page.goto("/geom.html?only=announcement");
        const popup = page.locator('[data-testid="announcement-popup"]');
        await expect(popup).toBeVisible({ timeout: 8000 });
        await expect(popup).toHaveAttribute("data-announcement-style", "modal");
        await expect(popup).toHaveAttribute("role", "dialog");
        await settle(page);

        // The label must come from the CMS, never a hardcoded "Register now".
        const cta = page.locator('[data-testid="announcement-cta-button"]');
        await expect(cta).toContainText("Latest news");
        await expect(cta).not.toContainText("Register now");
        await expect(cta).toHaveAttribute("href", "/news");

        // Exit path 1: the explicit close button.
        const close = page.locator('[data-testid="announcement-close-button"]');
        await expect(close).toBeVisible();
        const closeBox = await close.boundingBox();
        expect(closeBox!.width).toBeGreaterThanOrEqual(32);
        expect(closeBox!.height).toBeGreaterThanOrEqual(32);

        // Panel geometry.
        const panel = await page.evaluate(() => {
            const el = document.querySelector('[data-testid="announcement-popup"]') as HTMLElement;
            const surface = el.querySelector('div[class*="rounded-2xl"]') as HTMLElement;
            const r = surface.getBoundingClientRect();
            return {
                w: surface.offsetWidth,
                left: Math.round(r.left),
                right: Math.round(r.right),
                bottom: Math.round(r.bottom),
                viewport: { w: innerWidth, h: innerHeight },
            };
        });
        // Full-width on small screens, capped and comfortable on desktop.
        expect(panel.w).toBeGreaterThanOrEqual(Math.min(360, panel.viewport.w - 34));
        expect(panel.w).toBeLessThanOrEqual(560);
        expect(panel.left).toBeGreaterThanOrEqual(-1);
        expect(panel.right).toBeLessThanOrEqual(panel.viewport.w + 1);
        expect(panel.bottom).toBeLessThanOrEqual(panel.viewport.h + 1);

        // Exit path 2: Escape.
        await page.keyboard.press("Escape");
        await expect(popup).toBeHidden();
    });

    test("modal style: backdrop click dismisses", async ({ page }) => {
        await page.goto("/geom.html?only=announcement");
        const popup = page.locator('[data-testid="announcement-popup"]');
        await expect(popup).toBeVisible({ timeout: 8000 });
        await page.mouse.click(6, 6);
        await expect(popup).toBeHidden();
    });

    test("card style never blocks the page behind it", async ({ page }) => {
        await page.goto("/geom.html?only=announcement&style=card");
        const popup = page.locator('[data-testid="announcement-popup"]');
        await expect(popup).toBeVisible({ timeout: 8000 });
        await expect(popup).toHaveAttribute("data-announcement-style", "card");
        await settle(page);

        const probe = await page.evaluate(() => {
            const el = document.querySelector('[data-testid="announcement-popup"]') as HTMLElement;
            const surface = el.querySelector('div[class*="rounded-2xl"]') as HTMLElement;
            const r = surface.getBoundingClientRect();
            return {
                overlayPresent: !!document.querySelector('[role="dialog"][aria-modal="true"]'),
                blocksNothingTopLeft: document.elementFromPoint(8, 8) !== el,
                wrapperPointerEvents: getComputedStyle(el).pointerEvents,
                cardPointerEvents: getComputedStyle(el.firstElementChild as Element).pointerEvents,
                withinViewport:
                    r.left >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1 && r.width > 0,
                ctaLabel: (document.querySelector('[data-testid="announcement-cta-button"]') as HTMLElement)?.textContent?.trim(),
            };
        });

        expect(probe.overlayPresent).toBe(false);
        expect(probe.wrapperPointerEvents).toBe("none");
        expect(probe.cardPointerEvents).toBe("auto");
        expect(probe.blocksNothingTopLeft).toBe(true);
        expect(probe.withinViewport).toBe(true);
        expect(probe.ctaLabel).toContain("Latest news");
    });
});
