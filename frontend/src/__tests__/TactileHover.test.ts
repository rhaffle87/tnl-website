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

describe("shared tactile hover contract", () => {
    it.each([
        ["--tnl-motion-tactile-duration", "160ms"],
        ["--tnl-motion-tactile-easing", "cubic-bezier(0.2,0.8,0.2,1)"],
        ["--tnl-tactile-lift", "-1px"],
        ["--tnl-tactile-ring", "color-mix(in srgb,var(--gsm-accent)42%,transparent)"],
        ["--tnl-tactile-wash", "color-mix(in srgb,var(--gsm-accent)8%,transparent)"],
        ["--tnl-tactile-shadow", "0 6px 16px -6px color-mix(in srgb,var(--gsm-obsidian)28%,transparent)"],
    ])("declares %s in :root", (name, expected) => {
        expect(token(root, name)).toBe(compact(expected));
    });

    it("overrides the tactile ring and wash for dark surfaces", () => {
        expect(token(dark, "--tnl-tactile-ring")).toContain("var(--gsm-accent-glow)");
        expect(token(dark, "--tnl-tactile-wash")).toContain("var(--tnl-inverse-foreground)");
    });

    it("exposes a reusable .tnl-tactile helper", () => {
        const css = compact(indexCss);
        expect(css).toMatch(/\.tnl-tactile,button:not\(:disabled\)/);
        expect(css).toMatch(/transition-property:transform,box-shadow,border-color,background-color,color/);
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
        expect(block).toContain("transition-property:transform,box-shadow,border-color,background-color,color");
        expect(block).toContain("var(--tnl-motion-tactile-duration)");
        expect(block).toContain("var(--tnl-motion-tactile-easing)");
    });

    it("gates the hover lift behind a fine pointer with hover capability", () => {
        const css = compact(indexCss);
        expect(css).toMatch(/@media\(hover:hover\)and\(pointer:fine\)/);
        expect(css).toMatch(/:hover\{[^}]*transform:translateY\(var\(--tnl-tactile-lift\)\)/);
    });

    it("tints, rings and shadows the hovered surface from tokens", () => {
        const css = compact(indexCss);
        expect(css).toMatch(/:hover\{[^}]*inset0001pxvar\(--tnl-tactile-ring\)/);
        expect(css).toMatch(/:hover\{[^}]*inset000999pxvar\(--tnl-tactile-wash\)/);
        expect(css).toMatch(/:hover\{[^}]*var\(--tnl-tactile-shadow\)/);
    });

    it("adds a pressed state that settles back to scale 0.985", () => {
        expect(compact(indexCss)).toMatch(/:active\{[^}]*transform:translateY\(0\)scale\(0\.985\)/);
    });

    it("keeps the global reduced-motion override intact", () => {
        expect(indexCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\*,\s*\*::before,\s*\*::after\s*\{[^}]*transition-duration:\s*0\.01ms\s*!important/);
    });
});

describe("CMS tactile hover contract", () => {
    const css = compact(adminCss);

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

    it("reuses the shared motion tokens instead of local literals", () => {
        expect(css).toContain("var(--tnl-motion-tactile-duration)");
        expect(css).toContain("var(--tnl-motion-tactile-easing)");
        expect(css).toContain("var(--tnl-tactile-lift)");
        expect(css).toContain("var(--tnl-tactile-wash)");
        expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    });
});
