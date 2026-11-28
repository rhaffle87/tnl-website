import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { render, screen } from "@testing-library/react";
import { FormFieldsBuilder } from "@/components/admin/repeaters/FormFieldsBuilder";
import { AdminLocaleProvider } from "@/lib/i18n/admin-i18n";
import { LocaleContext, STRINGS } from "@/lib/i18n/i18n";

const read = (relative: string) => readFileSync(path.resolve(process.cwd(), relative), "utf8");

describe("registration integration removal copy", () => {
    it("documents database storage, CMS access and manual exports in both legal locales", () => {
        const legal = read("src/pages/LegalPages.tsx");
        expect(legal.match(/Google Workspace|Google Sheets|Apps Script|webhook|sinkronisasi data panitia/i)).toBeNull();
        expect(legal).toContain("Data pendaftaran disimpan di basis data MongoDB");
        expect(legal).toContain("Registration records are stored in the MongoDB database");
        expect(legal).toContain("panitia berwenang melalui CMS");
        expect(legal).toContain("authorized staff through the CMS");
        expect(legal).toContain("ekspor CSV/XLSX secara manual");
        expect(legal).toContain("manual CSV/XLSX exports");
        // Real external services and the existing legal navigation remain supported.
        expect(legal).toContain("Cloudflare, Inc.");
        expect(legal).toContain("Google Maps Embed");
        expect(legal).toContain('data-testid="privacy-toc"');
        expect(legal).toContain('data-testid="terms-toc"');
    });

    it.each(["en", "id"] as const)("describes rendered registration answers as database records available through CMS and exports in %s", (locale) => {
        const builder = read("src/components/admin/repeaters/FormFieldsBuilder.tsx");
        expect(builder.match(/Google Sheets|Apps Script|webhook/i)).toBeNull();
        render(createElement(LocaleContext.Provider, {
            value: { locale, setLocale: () => {}, t: (key) => STRINGS[locale][key] },
        }, createElement(AdminLocaleProvider, null,
            createElement(FormFieldsBuilder, { value: [], onChange: () => {} }))));
        const help = screen.getByText(locale === "en" ? /Answers are stored in the database/ : /Jawaban disimpan di basis data/);
        expect(help).toHaveTextContent(locale === "en" ? "managed through the CMS" : "dikelola melalui CMS");
        expect(help).toHaveTextContent(locale === "en" ? "manual CSV/XLSX exports" : "ekspor CSV/XLSX manual");
        expect(help.textContent?.match(/Google Sheets|Apps Script|webhook/i)).toBeNull();
    });

    it("keeps the backend test description aligned with database storage and exports", () => {
        const docstring = read("../backend/tests/test_open_house_registrar_and_pdp.py").split('"""')[1];
        expect(docstring.match(/Google Sheets|Apps Script|webhook|scor(?:e|ing)/i)).toBeNull();
        expect(docstring).toContain("MongoDB storage");
        expect(docstring).toContain("Excel/CSV exports");
        expect(docstring).toContain("UU PDP compliance");
    });
});
