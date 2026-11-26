import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const srcDir = path.resolve(process.cwd(), "src");
const read = (relative: string) => readFileSync(path.join(srcDir, relative), "utf8");
const compact = (value: string) => value.replace(/\s+/g, "");

function ruleBlock(css: string, selector: string): string {
    const at = css.indexOf(`${selector} {`);
    if (at < 0) return "";
    const open = css.indexOf("{", at);
    let depth = 0;
    for (let i = open; i < css.length; i += 1) {
        if (css[i] === "{") depth += 1;
        if (css[i] === "}") {
            depth -= 1;
            if (depth === 0) return css.slice(open + 1, i);
        }
    }
    return "";
}

function token(block: string, name: string): string {
    const match = block.match(new RegExp(`${name}\\s*:\\s*([^;]+);`));
    return match ? compact(match[1]) : "";
}

const indexCss = read("index.css");
const adminCss = read("components/admin/admin-editorial.css");
const root = ruleBlock(indexCss, ":root");
const dark = ruleBlock(indexCss, ".dark");
const hover = ruleBlock(indexCss, "@media (hover: hover) and (pointer: fine)");

describe("minimal tactile hover contract", () => {
    it.each([
        ["--tnl-motion-tactile-duration", "140ms"],
        ["--tnl-motion-tactile-easing", "cubic-bezier(0.2,0.8,0.2,1)"],
        ["--tnl-tactile-ring", "color-mix(in srgb,var(--gsm-accent)20%,transparent)"],
        ["--tnl-tactile-wash", "color-mix(in srgb,var(--gsm-accent)5%,transparent)"],
    ])("declares %s in :root", (name, expected) => {
        expect(token(root, name)).toBe(compact(expected));
    });

    it("drops the old lift and shadow tokens entirely", () => {
        expect(root).not.toMatch(/--tnl-tactile-lift|--tnl-tactile-shadow/);
        expect(dark).not.toMatch(/--tnl-tactile-lift|--tnl-tactile-shadow/);
        expect(indexCss).not.toMatch(/--tnl-tactile-lift|--tnl-tactile-shadow/);
        expect(adminCss).not.toMatch(/--tnl-tactile-lift|--tnl-tactile-shadow/);
    });

    it("overrides the tactile ring and wash for dark surfaces", () => {
        expect(token(dark, "--tnl-tactile-ring")).toContain("var(--gsm-accent-glow)");
        expect(token(dark, "--tnl-tactile-wash")).toContain("var(--tnl-inverse-foreground)");
    });

    it("exposes a reusable .tnl-tactile helper", () => {
        const css = compact(indexCss);
        expect(css).toMatch(/\.tnl-tactile,button:not\(:disabled\)/);
        expect(css).toMatch(/transition-property:transform,border-color,background-color,box-shadow,color/);
    });

    it.each([
        'button:not(:disabled):not([aria-disabled="true"])',
        'a[href]',
        "summary",
        "select",
        'input:is([type="checkbox"],[type="radio"],[type="range"])',
        '[role="button"]:not([aria-disabled="true"])',
        '[role="switch"]:not([aria-disabled="true"])',
        '[role="tab"]:not([aria-disabled="true"])',
        '[role="menuitem"]:not([aria-disabled="true"])',
        '[role="combobox"]:not([aria-disabled="true"])',
    ])("applies the shared transition to %s", (selector) => {
        expect(compact(indexCss)).toContain(compact(selector));
    });

    it("keeps tactile transitions in the utility layer above Tailwind button utilities", () => {
        const lastUtilities = indexCss.lastIndexOf("@layer utilities {");
        const block = compact(ruleBlock(indexCss.slice(lastUtilities), "@layer utilities"));
        expect(block).toContain("transition-property:transform,border-color,background-color,box-shadow,color");
        expect(block).toContain("var(--tnl-motion-tactile-duration)");
        expect(block).toContain("var(--tnl-motion-tactile-easing)");
    });

    it("limits hover feedback to a hairline and a whisper of tint on surfaces", () => {
        const css = compact(hover);
        expect(css).toContain("border-color:var(--tnl-tactile-ring)");
        expect(css).toContain("box-shadow:inset000999pxvar(--tnl-tactile-wash)");
        expect(css).not.toContain("background-color:var(--tnl-tactile-wash)");
    });

    it("never lifts, rings, tints or shadows text links on hover", () => {
        const css = compact(hover);
        expect(css).not.toContain('a[href]:not([aria-disabled="true"]):hover');
        expect(css).not.toContain("summary:hover");
        expect(css).not.toContain('[role="tab"]:not([aria-disabled="true"]):hover');
        expect(css).not.toContain('[role="menuitem"]:not([aria-disabled="true"]):hover');
        expect(css).not.toContain("transform:translateY");
        expect(css).not.toMatch(/box-shadow:(?!inset)/);
    });

    it("uses a single minimal press scale", () => {
        expect(compact(indexCss)).toMatch(/:active\{[^}]*transform:scale\(0\.99\)/);
        expect(compact(indexCss)).not.toMatch(/:active\{[^}]*scale\(0\.985\)/);
    });

    it("keeps the global reduced-motion override intact", () => {
        expect(indexCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\*,\s*\*::before,\s*\*::after\s*\{[^}]*transition-duration:\s*0\.01ms\s*!important/);
    });
});

describe("CMS tactile hover contract", () => {
    const css = compact(adminCss);
    const adminHover = ruleBlock(adminCss, "@media (hover: hover) and (pointer: fine)");

    it("scopes the admin tactile rule to the admin root shell", () => {
        expect(css).toContain('[data-testid="admin-root-shell"]');
    });

    it.each([
        "button",
        'a[href]',
        "summary",
        "select",
        '[role="switch"]',
        '[role="combobox"]',
        ".tnl-card",
    ])("covers the CMS primitive %s", (selector) => {
        expect(css).toContain(compact(selector));
    });

    it("reuses the shared motion tokens without local literals", () => {
        expect(css).toContain("var(--tnl-motion-tactile-duration)");
        expect(css).toContain("var(--tnl-motion-tactile-easing)");
        expect(css).toContain("var(--tnl-tactile-ring)");
        expect(css).toContain("var(--tnl-tactile-wash)");
        expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    });

    it("keeps the CMS hover as a hairline and faint tint, without lift or shadow", () => {
        const hovered = compact(adminHover);
        expect(hovered).toContain("border-color:var(--tnl-tactile-ring)");
        expect(hovered).toContain("box-shadow:inset000999pxvar(--tnl-tactile-wash)");
        expect(hovered).not.toContain("background-color:var(--tnl-tactile-wash)");
        expect(hovered).not.toContain("transform:translateY");
        expect(hovered).not.toMatch(/box-shadow:(?!inset)/);
    });

    it("uses the same minimal press scale in the CMS", () => {
        expect(css).toMatch(/:active\{[^}]*transform:scale\(0\.99\)/);
    });
});
