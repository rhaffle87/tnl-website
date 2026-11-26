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

test.describe("CMS list vs editor geometry", () => {
    /**
     * Screenshots 093128/093140 showed the edit form rendered *above* the table,
     * with "Search members..." and the whole roster still hanging underneath.
     * These gates measure the real admin shell: if the two views ever share a
     * route again, the table count below stops being zero.
     */
    const openAdminRoute = async (page: import("@playwright/test").Page, url: string) => {
        await page.goto(url);
        // Gate on shell furniture that exists in BOTH viewports. The account footer
        // (`admin-current-user`) lives in the desktop sidebar only — on mobile it sits
        // inside the closed drawer, so gating on it made the mobile gate fail.
        await expect(page.locator('[data-testid="admin-root-shell"]')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-testid="admin-topbar"]')).toBeVisible({ timeout: 15000 });
    };

    test("desktop: the editor route renders no collection table, and Save needs no scrolling", async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== "desktop", "desktop project only");
        await openAdminRoute(page, "/geom.html?only=editor&route=/admin/content/members/m-1");

        const bar = page.locator('[data-testid="content-editor-bar"]');
        await expect(bar).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-testid="content-editor-title"]')).toContainText("Achmad Affandi");

        // The regression: list furniture must not exist on the editor route.
        await expect(page.locator('[data-testid="content-table"]')).toHaveCount(0);
        await expect(page.locator("table")).toHaveCount(0);
        await expect(page.locator('[data-testid="content-search-input"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="content-add-button"]')).toHaveCount(0);

        // Save/Publish lives in the sticky bar, reachable without scrolling to the bottom.
        const viewport = page.viewportSize()!;
        const save = await page.locator('[data-testid="content-save-button"]').boundingBox();
        expect(save!.y).toBeLessThan(140);
        expect(save!.y + save!.height).toBeLessThanOrEqual(viewport.height);

        // Two columns: 320px inspector to the right of the canvas, both on screen.
        const columns = await page.evaluate(() => {
            const inspector = document.querySelector('[data-testid="content-inspector"]') as HTMLElement;
            const canvas = inspector.previousElementSibling as HTMLElement;
            const i = inspector.getBoundingClientRect();
            const c = canvas.getBoundingClientRect();
            return {
                inspectorW: inspector.offsetWidth,
                inspectorLeft: Math.round(i.left),
                canvasRight: Math.round(c.right),
                canvasW: canvas.offsetWidth,
                viewportW: innerWidth,
            };
        });
        expect(columns.inspectorW).toBeGreaterThanOrEqual(280);
        expect(columns.inspectorW).toBeLessThanOrEqual(340);
        expect(columns.inspectorLeft).toBeGreaterThanOrEqual(columns.canvasRight);
        expect(columns.canvasW).toBeGreaterThan(columns.inspectorW);
        expect(columns.canvasRight).toBeLessThanOrEqual(columns.viewportW);

        // Sticky truth: scrolling the admin main region must not carry the bar away.
        const before = (await bar.boundingBox())!;
        await page.locator("main").evaluate((el) => {
            el.scrollTop = 700;
        });
        await page.waitForTimeout(120);
        const after = (await bar.boundingBox())!;
        expect(after.y).toBeGreaterThanOrEqual(-1);
        expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(4);

        // No dead band above the bar: it must sit flush under the topbar, not
        // leave a strip of scrolled form exposed in the main padding.
        const shellTops = await page.evaluate(() => {
            const main = document.querySelector('[data-testid="admin-main-scroll"]') as HTMLElement;
            const topbar = document.querySelector('[data-testid="admin-topbar"]') as HTMLElement;
            return {
                main: Math.round(main.getBoundingClientRect().top),
                topbar: Math.round(topbar.getBoundingClientRect().bottom),
            };
        });
        expect(Math.round(after.y)).toBe(shellTops.main);
        expect(Math.round(after.y)).toBe(shellTops.topbar);

        // Editorial text must not be monospace source-code.
        const bioFont = await page
            .locator("textarea")
            .first()
            .evaluate((el) => getComputedStyle(el).fontFamily.toLowerCase());
        expect(bioFont).not.toContain("mono");
    });

    test("desktop: the list route keeps the table and shows no editor form", async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== "desktop", "desktop project only");
        await openAdminRoute(page, "/geom.html?only=editor&route=/admin/content/members");

        await expect(page.locator('[data-testid="content-table"]')).toBeVisible({ timeout: 15000 });
        await expect(page.locator('[data-testid="content-search-input"]')).toBeVisible();
        await expect(page.locator('[data-testid="content-add-button"]')).toBeVisible();
        // Nothing below the table: no form, no save bar, no textareas at all.
        await expect(page.locator('[data-testid="content-editor-bar"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="content-save-button"]')).toHaveCount(0);
        await expect(page.locator("textarea")).toHaveCount(0);
        await expect(page.locator('[data-testid="content-table"]')).toContainText("Achmad Affandi");
    });

    test("mobile: the editor stacks to one column with no horizontal overflow", async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== "mobile", "mobile project only");
        await openAdminRoute(page, "/geom.html?only=editor&route=/admin/content/members/m-1");
        await expect(page.locator('[data-testid="content-editor-bar"]')).toBeVisible({ timeout: 15000 });

        const stacked = await page.evaluate(() => {
            const inspector = document.querySelector('[data-testid="content-inspector"]') as HTMLElement;
            const canvas = inspector.previousElementSibling as HTMLElement;
            const i = inspector.getBoundingClientRect();
            const c = canvas.getBoundingClientRect();
            return {
                sameColumn: Math.abs(Math.round(i.left) - Math.round(c.left)) <= 2,
                belowCanvas: i.top >= c.bottom - 1,
                overflow: document.documentElement.scrollWidth - innerWidth,
            };
        });
        expect(stacked.sameColumn).toBe(true);
        expect(stacked.belowCanvas).toBe(true);
        expect(stacked.overflow).toBeLessThanOrEqual(1);

        await expect(page.locator('[data-testid="content-table"]')).toHaveCount(0);
    });
});

test.describe("InlineMediaField 320px pane", () => {
    /**
     * Screenshot showed the media field's thumbnail and action strip pushing
     * ~60px past a 320px CMS side pane (the "max-w-sm" 384px thumbnail had no
     * container to clamp to). The harness mounts the real field inside a hard
     * 320px box; the gate proves nothing escapes it and the cropper exists.
     */
    const probePane = (page: import("@playwright/test").Page) =>
        page.evaluate(() => {
            const pane = document.querySelector('[data-testid="geom-inline-pane"]') as HTMLElement;
            const pr = pane.getBoundingClientRect();
            const filled = document.querySelector('[data-testid="geom-inline-media"]') as HTMLElement;
            const thumb = filled.querySelector("img") as HTMLImageElement | null;
            const buttons = [...filled.querySelectorAll("button")] as HTMLElement[];
            const farRight = Math.max(pr.right, ...buttons.map((b) => b.getBoundingClientRect().right));
            return {
                paneW: pane.offsetWidth,
                paneScrollOverflow: pane.scrollWidth > pane.clientWidth + 1,
                thumbW: thumb?.getBoundingClientRect().width ?? 0,
                thumbnailInside: thumb ? thumb.getBoundingClientRect().right <= pr.right + 1 : true,
                farRightInside: farRight <= pr.right + 1,
                cropBtn: buttons.some((b) => b.dataset.testid?.endsWith("crop-btn")),
                pageOverflow: document.documentElement.scrollWidth - innerWidth,
            };
        });

    test("desktop: filled + empty field stay inside the pane, cropper available", async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== "desktop", "desktop project only");
        await page.goto("/geom.html?only=inlinemedia");
        await expect(page.locator('[data-testid="geom-inline-media-preview"]')).toBeVisible();
        await expect(page.locator('[data-testid="geom-inline-media-empty-dropzone"]')).toBeVisible();

        const probe = await probePane(page);
        expect(probe.paneW).toBe(320);
        expect(probe.paneScrollOverflow).toBe(false);
        expect(probe.thumbnailInside).toBe(true);
        // The old bug: a 384px thumbnail inside a 320px pane.
        expect(probe.thumbW).toBeGreaterThan(0);
        expect(probe.thumbW).toBeLessThanOrEqual(242);
        expect(probe.farRightInside).toBe(true);
        expect(probe.cropBtn).toBe(true);
        expect(probe.pageOverflow).toBeLessThanOrEqual(1);

        // The crop dialog opens with the current asset as its source.
        await page.locator('[data-testid="geom-inline-media-crop-btn"]').click();
        await expect(page.locator('[data-testid="image-crop-dialog"]')).toBeVisible();
        await expect(page.locator('[data-testid="image-crop-canvas"]')).toBeVisible();
        await page.locator('[data-testid="image-crop-close"]').click();
        await expect(page.locator('[data-testid="image-crop-dialog"]')).toHaveCount(0);
    });

    test("mobile: no horizontal overflow at 390px viewport either", async ({ page }, testInfo) => {
        test.skip(testInfo.project.name !== "mobile", "mobile project only");
        await page.goto("/geom.html?only=inlinemedia");
        await expect(page.locator('[data-testid="geom-inline-media-preview"]')).toBeVisible();

        const probe = await probePane(page);
        expect(probe.paneScrollOverflow).toBe(false);
        expect(probe.thumbnailInside).toBe(true);
        expect(probe.farRightInside).toBe(true);
        expect(probe.pageOverflow).toBeLessThanOrEqual(1);
    });
});
