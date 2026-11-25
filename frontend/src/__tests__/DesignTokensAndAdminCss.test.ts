import { existsSync, readFileSync, readdirSync } from "node:fs";
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

describe("single TNL token and type contract", () => {
    const indexCss = read("index.css");
    const root = ruleBlock(indexCss, ":root");
    const dark = ruleBlock(indexCss, ".dark");

    it.each([
        ["--tnl-inverse-foreground", "#F1F3EE"],
        ["--tnl-inverse-muted", "var(--gsm-accent-glow)"],
        ["--tnl-inverse-border", "color-mix(in srgb, var(--tnl-inverse-foreground) 24%, transparent)"],
        ["--tnl-type-h1", "clamp(2.25rem,6vw,5rem)"],
        ["--tnl-type-h2", "clamp(1.6rem,3.2vw,2.65rem)"],
        ["--tnl-type-h3", "clamp(1.25rem,2.2vw,1.8rem)"],
        ["--tnl-type-h4", "1.25rem"],
        ["--tnl-type-h5", "1rem"],
        ["--tnl-type-label", "clamp(0.75rem,0.72rem+0.15vw,0.8125rem)"],
    ])("declares %s in :root", (name, expected) => {
        expect(token(root, name)).toBe(compact(expected));
    });

    it("inherits the inverse foreground from the dark GSM text colour", () => {
        expect(token(dark, "--tnl-inverse-foreground")).toBe("var(--gsm-text-primary)");
    });

    it("keeps the mono label floor at or above 12px", () => {
        const label = token(root, "--tnl-type-label");
        const floor = label.match(/clamp\(([\d.]+)rem/);
        expect(floor).not.toBeNull();
        expect(Number(floor?.[1]) * 16).toBeGreaterThanOrEqual(12);
    });

    it("defines .tnl-mono-label from the label token and mono font", () => {
        expect(indexCss).toMatch(/\.tnl-mono-label\s*\{[^}]*font:\s*var\(--tnl-type-label\)\s*\/\s*1\.6\s+var\(--font-mono\)/);
    });
});

describe("colour literals live only in token declarations", () => {
    const colourLiteral = /#[0-9a-fA-F]{3,8}\b|rgba?\(/;
    const outsideTokenBlocks = (css: string) =>
        css
            .replace(/:root\s*\{[\s\S]*?\n\}/g, "")
            .replace(/\.dark\s*\{[\s\S]*?\n\}/g, "")
            .replace(/\/\*[\s\S]*?\*\//g, "");

    const ownedCss = [
        "components/site/signal-editorial.css",
        "pages/activity-editorial.css",
        "pages/editorial-content.css",
        "pages/utility-editorial.css",
        "components/site/member-profile.css",
    ];

    it("keeps hex/rgba literals out of index.css outside :root/.dark", () => {
        expect(outsideTokenBlocks(read("index.css"))).not.toMatch(colourLiteral);
    });

    it.each(ownedCss)("uses tokens instead of colour literals in %s", (file) => {
        expect(outsideTokenBlocks(read(file))).not.toMatch(colourLiteral);
    });
});

describe("mono label scale", () => {
    const ownedCss = [
        "components/site/signal-editorial.css",
        "pages/activity-editorial.css",
        "pages/editorial-content.css",
        "pages/utility-editorial.css",
        "components/site/member-profile.css",
    ];

    it.each(ownedCss)("uses --tnl-type-label for mono shorthands in %s", (file) => {
        const css = read(file);
        const shorthands = [...css.matchAll(/font:\s*([^;]*var\(--font-mono(?:,[^)]*)?\)[^;]*);/g)].map((match) => compact(match[1]));
        for (const shorthand of shorthands) {
            expect(shorthand, `in ${file}`).toContain("var(--tnl-type-label)");
        }
        expect(css).not.toMatch(/font-size:\s*(?:[89]|1[01])px/);
    });
});

describe("admin-only CSS is out of the public bundle", () => {
    const indexCss = read("index.css");
    const adminCss = read("components/admin/admin-editorial.css");
    const adminUi = read("pages/admin/AdminUI.tsx");

    const adminRules = [
        ".tnl-admin-sidebar-scroll",
        ".tnl-rich-text .ProseMirror",
        ".tnl-admin-live-badge",
        "@keyframes tnl-live-pulse",
    ];

    it.each(adminRules)("keeps %s out of index.css", (rule) => {
        expect(indexCss).not.toContain(rule);
    });

    it.each(adminRules)("moves %s into admin-editorial.css", (rule) => {
        expect(adminCss).toContain(rule);
    });

    it("imports the admin stylesheet from AdminUI", () => {
        expect(adminUi).toMatch(/import\s+"@\/components\/admin\/admin-editorial\.css";/);
    });

    it("leaves the global reduced-motion block in index.css", () => {
        expect(indexCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{\s*\*,\s*\*::before,\s*\*::after\s*\{[^}]*animation-duration/);
    });
});

describe("dead duplicate stylesheet is gone", () => {
    it("removes pages/member-profile.css", () => {
        expect(existsSync(path.join(srcDir, "pages/member-profile.css"))).toBe(false);
    });

    it("has no imports of the dead stylesheet", () => {
        const offenders: string[] = [];
        const walk = (dir: string) => {
            for (const entry of readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, entry.name);
                if (entry.isDirectory()) {
                    if (entry.name !== "__tests__") walk(full);
                }
                else if (/\.tsx?$/.test(entry.name) && /pages\/member-profile\.css|\.\/member-profile\.css/.test(readFileSync(full, "utf8")) && !full.endsWith("MemberSections.tsx")) offenders.push(full);
            }
        };
        walk(srcDir);
        expect(offenders).toEqual([]);
    });
});

describe("touch fallback for hover-only controls", () => {
    const galleryCss = read("components/site/signal-editorial.css");

    it("provides a hover: none gallery fallback", () => {
        expect(galleryCss).toMatch(/@media\s*\(hover:\s*none\)/);
        const block = galleryCss.match(/@media\s*\(hover:\s*none\)\s*\{([^}]*\}[^}]*\})/)?.[1] ?? "";
        expect(block).toMatch(/\.signal-gallery-media img\s*\{[^}]*transform:\s*scale\(/);
        expect(block).toMatch(/\.signal-gallery-caption\s*\{[^}]*border-bottom/);
    });
});

describe("status badge and announcement contract", () => {
    const indexCss = read("index.css");
    const root = ruleBlock(indexCss, ":root");
    const dark = ruleBlock(indexCss, ".dark");

    it.each([
        "--tnl-status-open-bg",
        "--tnl-status-open-fg",
        "--tnl-status-upcoming-bg",
        "--tnl-status-upcoming-fg",
        "--tnl-status-neutral-bg",
        "--tnl-status-neutral-fg",
        "--tnl-status-full-bg",
        "--tnl-status-full-fg",
    ])("declares %s in :root", (name) => {
        expect(token(root, name)).not.toBe("");
    });

    it("re-tunes open, neutral and full badges for dark cards", () => {
        for (const name of ["--tnl-status-open-bg", "--tnl-status-neutral-bg", "--tnl-status-full-bg"]) {
            expect(token(dark, name), name).not.toBe("");
        }
    });

    it("references the status tokens instead of hex literals in Primitives", () => {
        const primitives = read("components/site/Primitives.tsx");
        expect(primitives).toMatch(/var\(--tnl-status-open-bg\)/);
        expect(primitives).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    });

    it("lets the shared section heading follow the single h2 scale", () => {
        const primitives = read("components/site/Primitives.tsx");
        expect(primitives).not.toMatch(/text-\[(?:28|35)px\]/);
        expect(primitives).toMatch(/tnl-h2 font-bold tracking-tight/);
    });

    it("compacts the announcement card on phones without hiding content", () => {
        const chrome = read("components/site/Chrome.tsx");
        expect(chrome).toContain("max-h-[min(62vh,460px)]");
        expect(chrome).toContain("line-clamp-4");
        expect(chrome).toContain("sm:line-clamp-none");
    });

    it("labels the activity tab as Training while the route key stays stable", () => {
        const chrome = read("components/site/Chrome.tsx");
        expect(chrome).toContain('{ key: "nav_training", to: "/activity?tab=practicum" }');
        expect(chrome).not.toContain('key: "nav_practicum"');
        expect(read("lib/i18n.ts")).not.toMatch(/nav_practicum: "Practicum"/);
        expect(read("lib/i18n.ts")).not.toMatch(/practicum_modules: "Practicum modules"/);
    });

    it("keeps the CMS editor bar opaque so content cannot ghost through it", () => {
        const editor = read("pages/admin/ContentEditor.tsx");
        expect(editor).not.toContain("backdrop-blur-md");
        expect(editor).toContain('background: "var(--card)"');
    });

});

describe("single heading type scale", () => {
    const pageCss = [
        "components/site/signal-editorial.css",
        "pages/activity-editorial.css",
        "pages/editorial-content.css",
        "pages/utility-editorial.css",
    ];

    it.each(["h1", "h2", "h3", "h4", "h5"])("routes .tnl-%s through its type token", (level) => {
        expect(read("index.css")).toMatch(new RegExp(`\\.tnl-${level}\\s*\\{[^}]*font-size:\\s*var\\(--tnl-type-${level}\\)`));
    });

    it.each(pageCss)("has no independent h1/h2 font sizes in %s", (file) => {
        const css = read(file);
        const independent = css.split("\n").filter((line) => /\bh[12]\b/.test(line) && (line.match(/font(?:-size)?:\s*[^;]+;/g) ?? []).some((declaration) => !declaration.includes("var(--tnl-type-")));
        expect(independent, `in ${file}`).toEqual([]);
        expect(css).toMatch(/var\(--tnl-type-h[12]\)/);
    });
});
