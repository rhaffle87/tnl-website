import { useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { FormFieldsBuilder } from "@/components/admin/repeaters/FormFieldsBuilder";
import type { FormField } from "@/lib/types/types";
import { ObjectListRepeater, type RepeaterFieldSpec } from "@/components/admin/repeaters/ObjectListRepeater";
import { RichTextField } from "@/components/admin/editor/RichTextField";
import { AdminLocaleProvider } from "@/lib/i18n/admin-i18n";
import { LocaleContext, STRINGS } from "@/lib/i18n/i18n";

// Keep the real Tiptap/DOM; isolate only the API-backed media picker.
vi.mock("@/components/admin/media", () => ({
    MediaPickerModal: ({ open, onSelect }: { open: boolean; onSelect: (items: unknown[]) => void }) => open ? (
        <button data-testid="pick-authored-image" onClick={() => onSelect([{ url: "/photo.png", alt: "Authored photo description" }])}>Pick fixture</button>
    ) : null,
}));

type Locale = "en" | "id";
function Locale({ locale, children }: { locale: Locale; children: ReactNode }) {
    return <LocaleContext.Provider value={{ locale, setLocale: vi.fn(), t: (key: keyof typeof STRINGS.en) => STRINGS[locale][key] }}>
        <AdminLocaleProvider>{children}</AdminLocaleProvider>
    </LocaleContext.Provider>;
}

afterEach(cleanup);

const toolbarNames = {
    en: ["Paragraph", "Heading 3", "Heading 4", "Bold", "Italic", "Bullet list", "Numbered list", "Quote", "Inline code", "Divider", "Insert link", "Remove link", "Insert image", "Undo", "Redo"],
    id: ["Paragraf", "Judul 3", "Judul 4", "Tebal", "Miring", "Daftar berpoin", "Daftar bernomor", "Kutipan", "Kode sebaris", "Pemisah", "Sisipkan tautan", "Hapus tautan", "Sisipkan gambar", "Urungkan", "Ulangi"],
};

describe("rich-text locale copy", () => {
    it.each(["en", "id"] as const)("renders real toolbar, modes, link validation and authored media in %s", async (locale) => {
        render(<Locale locale={locale}><RichTextField value="<p>Authored body</p>" onChange={vi.fn()} /></Locale>);
        const toolbar = screen.getByRole("toolbar", { name: locale === "en" ? "Formatting" : "Pemformatan" });
        for (const name of toolbarNames[locale]) expect(within(toolbar).getByRole("button", { name })).toHaveAttribute("title", name);
        await waitFor(() => expect(screen.getByTestId("rich-text-link")).toBeEnabled());
        fireEvent.click(screen.getByRole("button", { name: toolbarNames[locale][10] }));
        const input = screen.getByRole("textbox", { name: locale === "en" ? "Link URL" : "URL tautan" });
        expect(input).toHaveAttribute("placeholder", locale === "en" ? "https://example.com or /news" : "https://example.com atau /news");
        fireEvent.change(input, { target: { value: "javascript:alert(1)" } });
        fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Apply" : "Terapkan" }));
        expect(screen.getByRole("alert")).toHaveTextContent(locale === "en" ? "Use https://, http://, a /path or mailto: link." : "Gunakan tautan https://, http://, /path, atau mailto:.");
        expect(input).toHaveAttribute("aria-invalid", "true");
        expect(document.getElementById(input.getAttribute("aria-describedby")!)).toBe(screen.getByRole("alert"));
        fireEvent.change(input, { target: { value: "/news" } });
        fireEvent.click(screen.getByTestId("rich-text-link-apply"));
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: toolbarNames[locale][12] }));
        fireEvent.click(screen.getByTestId("pick-authored-image"));
        fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Preview" : "Pratinjau" }));
        expect(screen.getByTestId("rich-text-preview")).toHaveTextContent("Authored body");
        expect(within(screen.getByTestId("rich-text-preview")).getByRole("img")).toHaveAttribute("alt", "Authored photo description");
        fireEvent.click(screen.getByRole("button", { name: "</> HTML" }));
        expect((screen.getByRole("textbox", { name: locale === "en" ? "Raw HTML" : "HTML mentah" }) as HTMLTextAreaElement).value).toContain("Authored body");
        expect(screen.getByTestId("rich-text-word-count")).toHaveTextContent(locale === "en" ? "2 words · about 1 min read" : "2 kata · sekitar 1 menit baca");
    });

    it("updates the real editor placeholder and existing errors when the locale changes", async () => {
        const view = render(<Locale locale="en"><RichTextField value="" onChange={vi.fn()} /></Locale>);
        await waitFor(() => expect(screen.getByTestId("rich-text-editor").querySelector("[data-placeholder]")).toHaveAttribute("data-placeholder", "Write the article…"));
        fireEvent.click(screen.getByTestId("rich-text-link"));
        fireEvent.click(screen.getByTestId("rich-text-link-apply"));
        view.rerender(<Locale locale="id"><RichTextField value="" onChange={vi.fn()} /></Locale>);
        await waitFor(() => expect(screen.getByTestId("rich-text-editor").querySelector("[data-placeholder]")).toHaveAttribute("data-placeholder", "Tulis artikel…"));
        expect(screen.getByRole("alert")).toHaveTextContent("Gunakan tautan https://, http://, /path, atau mailto:.");
        expect(screen.getByTestId("rich-text-word-count")).toHaveTextContent("0 kata · sekitar 0 menit baca");
    });

    it("keeps exact English toolbar names without a provider and never translates authored placeholders", async () => {
        const view = render(<RichTextField value="" placeholder="Authored placeholder" onChange={vi.fn()} />);
        expect(screen.getByRole("toolbar", { name: "Formatting" })).toBeInTheDocument();
        for (const name of toolbarNames.en) expect(screen.getByRole("button", { name })).toBeInTheDocument();
        view.rerender(<Locale locale="id"><RichTextField value="" placeholder="Authored placeholder" onChange={vi.fn()} /></Locale>);
        await waitFor(() => expect(screen.getByTestId("rich-text-editor").querySelector("[data-placeholder]")).toHaveAttribute("data-placeholder", "Authored placeholder"));
    });
});

const repeaterFields: RepeaterFieldSpec[] = [
    { key: "title", label: "Title (English)", type: "text", placeholder: "e.g. Introduction to Packet Tracer" },
    { key: "custom", label: "Authored label", type: "text", placeholder: "Authored placeholder", help: "Authored help" },
    { key: "file_type", label: "File Format", type: "select", options: ["pdf", "other"] },
];
function RepeaterHarness() {
    const [items, setItems] = useState<Record<string, unknown>[]>([]);
    return <><ObjectListRepeater value={items} onChange={setItems} fields={repeaterFields} /><output data-testid="saved-items">{JSON.stringify(items)}</output></>;
}

describe("object repeater locale copy", () => {
    it.each(["en", "id"] as const)("localizes built-in schema copy and supports real add/move/duplicate/delete interactions in %s", (locale) => {
        render(<Locale locale={locale}><RepeaterHarness /></Locale>);
        const add = locale === "en" ? "+ Add Item" : "+ Tambah Item";
        expect(screen.getByText(locale === "en" ? "No items yet. Click the button below to add one." : "Belum ada item. Klik tombol di bawah untuk menambahkan.")).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: add }));
        expect(screen.getByTestId("object-list-repeater-card-title-0")).toHaveTextContent("Item #1");
        expect(screen.getByText(locale === "en" ? "Title (English)" : "Judul (Inggris)")).toBeInTheDocument();
        expect(screen.getByPlaceholderText(locale === "en" ? "e.g. Introduction to Packet Tracer" : "mis. Pengenalan Packet Tracer")).toBeInTheDocument();
        expect(screen.getByText("Authored label")).toBeInTheDocument();
        expect(screen.getByPlaceholderText("Authored placeholder")).toBeInTheDocument();
        expect(screen.getByText("Authored help")).toBeInTheDocument();
        expect(screen.getByRole("option", { name: "pdf" })).toHaveValue("pdf");
        expect(screen.getByRole("option", { name: "other" })).toHaveValue("other");
        fireEvent.change(screen.getByTestId("object-list-repeater-item-0-title"), { target: { value: "Title (English)" } });
        fireEvent.click(screen.getByRole("button", { name: add }));
        fireEvent.click(screen.getAllByRole("button", { name: locale === "en" ? "Move item down" : "Pindahkan item ke bawah" })[0]);
        expect(screen.getByTestId("object-list-repeater-card-title-1")).toHaveTextContent("Title (English)");
        fireEvent.click(screen.getAllByRole("button", { name: locale === "en" ? "Duplicate item" : "Duplikat item" })[1]);
        expect(JSON.parse(screen.getByTestId("saved-items").textContent!)).toHaveLength(3);
        fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Collapse all" : "Ciutkan semua" }));
        expect(screen.queryByTestId("object-list-repeater-item-0-title")).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Expand all" : "Perluas semua" }));
        fireEvent.click(screen.getAllByRole("button", { name: locale === "en" ? "Delete item" : "Hapus item" })[0]);
        const saved = JSON.parse(screen.getByTestId("saved-items").textContent!);
        expect(saved).toEqual([{ title: "Title (English)", custom: "", file_type: "pdf" }, { title: "Title (English)", custom: "", file_type: "pdf" }]);
    });

    it("updates raw JSON errors with the locale and preserves alert associations and custom copy", () => {
        const node = <ObjectListRepeater value={[]} onChange={vi.fn()} fields={[]} label="Authored heading" addButtonLabel="Authored action" emptyMessage="Authored empty" help="Authored instructions" />;
        const view = render(<Locale locale="en">{node}</Locale>);
        for (const text of ["Authored heading", "Authored action", "Authored empty", "Authored instructions"]) expect(screen.getByText(text)).toBeInTheDocument();
        fireEvent.click(screen.getByRole("button", { name: "</> Raw JSON" }));
        const raw = screen.getByTestId("object-list-repeater-raw-textarea");
        fireEvent.change(raw, { target: { value: "{}" } });
        expect(screen.getByRole("alert")).toHaveTextContent("Must be a JSON array of items");
        view.rerender(<Locale locale="id">{node}</Locale>);
        expect(screen.getByRole("alert")).toHaveTextContent("Harus berupa larik JSON berisi item");
        expect(raw).toHaveAttribute("aria-invalid", "true");
        expect(document.getElementById(raw.getAttribute("aria-describedby")!)).toBe(screen.getByRole("alert"));
        fireEvent.change(raw, { target: { value: "{broken" } });
        expect(screen.getByRole("alert")).toHaveTextContent("Sintaks JSON tidak valid");
        fireEvent.click(screen.getByRole("button", { name: "Editor Visual" }));
        expect(raw).toBeInTheDocument();
        fireEvent.change(raw, { target: { value: "[]" } });
        fireEvent.click(screen.getByRole("button", { name: "Editor Visual" }));
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Authored action" })).toBeInTheDocument();
    });
});
function FormHarness() {
    const [fields, setFields] = useState<FormField[]>([{ type: "select", label: "Authored question", required: false, options: ["Title", "Other"] }]);
    return <><FormFieldsBuilder value={fields} onChange={setFields} /><output data-testid="saved-fields">{JSON.stringify(fields)}</output></>;
}

describe("form builder locale copy", () => {
    it("uses an English preview heading without a locale provider", () => {
        render(<FormFieldsBuilder value={[]} onChange={vi.fn()} />);
        fireEvent.click(screen.getByRole("button", { name: "Preview Form" }));
        expect(within(screen.getByTestId("form-fields-builder-preview-pane"))
            .getByText("Registration Form Preview (Read-Only)")).toBeInTheDocument();
    });

    it.each(["en", "id"] as const)("localizes built-in controls and preserves real question/option edits in %s", (locale) => {
        render(<Locale locale={locale}><FormHarness /></Locale>);
        expect(screen.getByText(locale === "en" ? "Registration Form Fields" : "Kolom Formulir Pendaftaran")).toBeInTheDocument();
        expect(screen.getByText(locale === "en" ? "Question Label" : "Label Pertanyaan")).toBeInTheDocument();
        expect(screen.getByTestId("form-fields-builder-label-0")).toHaveValue("Authored question");
        expect(screen.getByTestId("form-fields-builder-key-0")).toHaveValue("f_authored-question");
        const typeLabels = locale === "en" ? ["Short Text", "Long Text / Paragraph", "Email Address", "NRP / NIM (Student ID)", "Phone / WhatsApp", "Dropdown Select", "Checkbox (Yes / No)", "File Upload (PDF / Image)"] : ["Teks Singkat", "Teks Panjang / Paragraf", "Alamat Email", "NRP / NIM (ID Mahasiswa)", "Telepon / WhatsApp", "Pilihan Dropdown", "Kotak Centang (Ya / Tidak)", "Unggah Berkas (PDF / Gambar)"];
        const types = ["text", "textarea", "email", "nim", "tel", "select", "checkbox", "file"];
        typeLabels.forEach((label, i) => expect(screen.getByRole("option", { name: label })).toHaveValue(types[i]));
        const required = screen.getByRole("switch", { name: locale === "en" ? "Required" : "Wajib Diisi" });
        expect(screen.getByText(locale === "en" ? "Registrants cannot submit the form without answering this question." : "Pendaftar tidak bisa mengirim formulir tanpa mengisi pertanyaan ini.")).toBeInTheDocument();
        fireEvent.click(required);
        expect(required).toHaveAttribute("aria-checked", "true");
        fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "+ Add Option" : "+ Tambah Opsi" }));
        expect(screen.getByTestId("form-fields-builder-option-0-2")).toHaveValue("Pilihan 3");
        fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Remove option Other" : "Hapus opsi Other" }));
        fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "+ Add Form Question" : "+ Tambah Pertanyaan Formulir" }));
        expect(screen.getByTestId("form-fields-builder-question-title-1")).toHaveTextContent(locale === "en" ? "New Question 2" : "Pertanyaan Baru 2");
        fireEvent.click(screen.getAllByRole("button", { name: locale === "en" ? "Move question down" : "Pindahkan pertanyaan ke bawah" })[0]);
        expect(screen.getByTestId("form-fields-builder-question-title-1")).toHaveTextContent("Authored question");
        fireEvent.click(screen.getAllByRole("button", { name: locale === "en" ? "Delete question" : "Hapus pertanyaan" })[0]);
        fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Preview Form" : "Pratinjau Formulir" }));
        const preview = screen.getByTestId("form-fields-builder-preview-pane");
        expect(within(preview).getByText(locale === "en" ? "Registration Form Preview (Read-Only)" : "Pratinjau Formulir Pendaftar (Hanya Baca)")).toBeInTheDocument();
        expect(within(preview).getByText("Authored question")).toBeInTheDocument();
        expect(within(preview).getByRole("option", { name: "Title" })).toBeInTheDocument();
        expect(within(preview).getByRole("option", { name: locale === "en" ? "-- Select an option --" : "-- Pilih opsi --" })).toBeInTheDocument();
        const data = JSON.parse(screen.getByTestId("saved-fields").textContent!);
        expect(data).toEqual([{ type: "select", label: "Authored question", required: true, options: ["Title", "Pilihan 3"] }]);
    });

    it("keeps raw form validation associated and translates already-visible errors on locale change", () => {
        const node = <FormFieldsBuilder value={[]} onChange={vi.fn()} />;
        const view = render(<Locale locale="en">{node}</Locale>);
        fireEvent.click(screen.getByRole("button", { name: "</> Raw JSON" }));
        const raw = screen.getByTestId("form-fields-builder-raw-textarea");
        fireEvent.change(raw, { target: { value: "{}" } });
        expect(screen.getByRole("alert")).toHaveTextContent("Must be a JSON array of questions");
        view.rerender(<Locale locale="id">{node}</Locale>);
        expect(screen.getByRole("alert")).toHaveTextContent("Harus berupa larik JSON berisi pertanyaan");
        expect(raw).toHaveAttribute("aria-invalid", "true");
        expect(document.getElementById(raw.getAttribute("aria-describedby")!)).toBe(screen.getByRole("alert"));
        fireEvent.click(screen.getByRole("button", { name: "Editor Visual" }));
        expect(screen.getByRole("alert")).toHaveTextContent("Kolom formulir harus berupa larik pertanyaan");
        fireEvent.change(raw, { target: { value: "{broken" } });
        expect(screen.getByRole("alert")).toHaveTextContent("Sintaks JSON tidak valid");
        fireEvent.change(raw, { target: { value: "[]" } });
        fireEvent.click(screen.getByRole("button", { name: "Editor Visual" }));
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });

    it("preserves custom schema heading/help and authored preview content", () => {
        render(<Locale locale="id"><FormFieldsBuilder label="Custom title" help="Custom help" value={[{ type: "text", label: "Short Text", required: false, options: [] }]} onChange={vi.fn()} /></Locale>);
        expect(screen.getByText("Custom title")).toBeInTheDocument();
        expect(screen.getByText("Custom help")).toBeInTheDocument();
        expect(screen.getByTestId("form-fields-builder-label-0")).toHaveValue("Short Text");
        fireEvent.click(screen.getByRole("button", { name: "Pratinjau Formulir" }));
        expect(within(screen.getByTestId("form-fields-builder-preview-pane")).getByText("Short Text")).toBeInTheDocument();
    });
});


describe("built-in default matching", () => {
    it.each(["constructor", "__proto__", "toString"])("preserves unmatched schema copy %s instead of reading inherited object keys", (text) => {
        render(<Locale locale="id">
            <FormFieldsBuilder label={text} help="Authored help" value={[]} onChange={vi.fn()} />
            <ObjectListRepeater label={text} value={[{}]} fields={[{ key: "custom", label: text, type: "text" }]} onChange={vi.fn()} />
        </Locale>);
        expect(screen.getAllByRole("heading", { name: text })).toHaveLength(2);
        expect(screen.getAllByText(text)).toHaveLength(3);
    });
});

