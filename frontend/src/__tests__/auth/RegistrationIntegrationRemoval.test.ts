import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

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

    it("describes registration form answers as database records available through CMS and exports", () => {
        const builder = read("src/components/admin/repeaters/FormFieldsBuilder.tsx");
        expect(builder.match(/Google Sheets|Apps Script|webhook/i)).toBeNull();
        expect(builder).toContain("Answers are stored in the database");
        expect(builder).toContain("managed through the CMS");
        expect(builder).toContain("CSV/XLSX exports");
    });

    it("keeps the backend test description aligned with database storage and exports", () => {
        const docstring = read("../backend/tests/test_open_house_registrar_and_pdp.py").split('"""')[1];
        expect(docstring.match(/Google Sheets|Apps Script|webhook|scor(?:e|ing)/i)).toBeNull();
        expect(docstring).toContain("MongoDB storage");
        expect(docstring).toContain("Excel/CSV exports");
        expect(docstring).toContain("UU PDP compliance");
    });
});
