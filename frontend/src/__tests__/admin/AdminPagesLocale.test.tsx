import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { ApiError } from "@/lib/api/api";
import { AdminLocaleProvider } from "@/lib/i18n/admin-i18n";
import { LocaleContext, STRINGS, type Locale } from "@/lib/i18n/i18n";
import type { LabPhotoSlots, PageDoc } from "@/lib/types/types";
import PagesList from "@/pages/admin/PagesList";
import { LabPhotosPage, PublicationImportPage } from "@/pages/admin/LabConsentScreens";

const mocks = vi.hoisted(() => ({
    apiGet: vi.fn(), apiPost: vi.fn(), apiPatch: vi.fn(), apiDelete: vi.fn(),
    success: vi.fn(), error: vi.fn(), info: vi.fn(),
}));
vi.mock("@/lib/api/api", async (importOriginal) => ({
    ...await importOriginal<typeof import("@/lib/api/api")>(),
    apiGet: mocks.apiGet, apiPost: mocks.apiPost, apiPatch: mocks.apiPatch, apiDelete: mocks.apiDelete,
}));
vi.mock("sonner", () => ({ toast: { success: mocks.success, error: mocks.error, info: mocks.info } }));

type Mode = Locale | "default";
const modes: Mode[] = ["en", "id", "default"];
const page: PageDoc = {
    id: "p1", slug: "authored-slug", title: "Authored CMS title", title_id: "Judul CMS asli",
    status: "draft", is_system: false, needs_review: false, issues: [],
    created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z", blocks: [],
};
const builderPage: PageDoc = {
    ...page,
    blocks: [
        { id: "image-1", type: "image", hidden: false, props: { url: "/authored.webp", title: "CMS English", title_id: "CMS Indonesia" } },
        { id: "gallery-1", type: "gallery", hidden: true, props: { images: ["/one.webp", { url: "/two.webp", alt: "Authored alt" }] } },
        { id: "plugin-1", type: "plugin_type", hidden: false, props: {} },
    ],
};
async function openBuilder(mode: Mode, fixture = builderPage) {
    mocks.apiGet.mockImplementation(async (url: string) => {
        if (url === "/admin/pages") return { items: [fixture], total: 1 };
        if (url.endsWith("/revisions")) return { items: [], total: 0 };
        return fixture;
    });
    mocks.apiPost.mockResolvedValue(fixture);
    mocks.apiPatch.mockResolvedValue(fixture);
    mocks.apiDelete.mockResolvedValue(fixture);
    const rendered = mount(<PagesList />, mode);
    fireEvent.click(await screen.findByTestId("page-card-authored-slug"));
    await screen.findByTestId("page-builder-authored-slug");
    return rendered;
}
function mount(ui: ReactNode, mode: Mode) {
    const locale = mode === "default" ? "id" : mode;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    return render(
        <QueryClientProvider client={queryClient}>
            <LocaleContext.Provider value={{ locale, setLocale: vi.fn(), t: (key) => STRINGS[locale][key] }}>
                {mode === "default" ? ui : <AdminLocaleProvider>{ui}</AdminLocaleProvider>}
            </LocaleContext.Provider>
        </QueryClientProvider>,
    );
}
beforeEach(() => {
    vi.resetAllMocks();
    mocks.apiGet.mockImplementation(async (url: string) => url === "/admin/pages" ? { items: [page], total: 1 } : page);
    mocks.apiPost.mockResolvedValue(page);
    mocks.apiPatch.mockResolvedValue(page);
    mocks.apiDelete.mockResolvedValue(page);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("admin pages locale", () => {
    it.each(modes)("renders page-list controls and preserves CMS data in %s", async (mode) => {
        const id = mode === "id";
        mount(<PagesList />, mode);
        expect(screen.getByRole("heading", { name: id ? "Halaman" : "Pages" })).toBeInTheDocument();
        expect(screen.getByText(id
            ? "Setiap halaman di situs publik tersusun dari widget. Klik halaman untuk mengubah isinya."
            : "Every page on the public site is built from widgets. Click a page to change what is on it.")).toBeInTheDocument();
        expect(screen.getByText(id ? "Buat halaman baru" : "Create a new page")).toBeInTheDocument();
        expect(screen.getByLabelText(id ? "Judul halaman baru" : "New page title"))
            .toHaveAttribute("placeholder", id ? "Judul halaman" : "Page title");
        expect(screen.getByLabelText(id ? "Alamat web halaman baru" : "New page web address"))
            .toHaveAttribute("placeholder", id ? "Alamat web (opsional)" : "Web address (optional)");
        expect(screen.getByRole("button", { name: id ? "Buat" : "Create" })).toBeDisabled();
        const card = await screen.findByTestId("page-card-authored-slug");
        expect(card).toHaveTextContent("Authored CMS title");
        expect(card).toHaveTextContent("/authored-slug");
        expect(card).toHaveTextContent(id ? "0 widget" : "0 widget(s)");
    });

    it.each(modes)("localizes list loading in %s", (mode) => {
        mocks.apiGet.mockReturnValue(new Promise(() => {}));
        mount(<PagesList />, mode);
        expect(screen.getByText(mode === "id" ? "Memuat…" : "Loading…")).toBeInTheDocument();
    });

    it.each(modes)("localizes page creation feedback without changing backend detail in %s", async (mode) => {
        const id = mode === "id";
        mocks.apiPost.mockRejectedValueOnce(new Error("offline"))
            .mockRejectedValueOnce(new ApiError(400, { detail: "Authored backend detail" }))
            .mockResolvedValueOnce(page);
        mount(<PagesList />, mode);
        fireEvent.change(screen.getByTestId("new-page-title-input"), { target: { value: "Authored new title" } });
        fireEvent.change(screen.getByTestId("new-page-slug-input"), { target: { value: "new-slug" } });
        fireEvent.click(screen.getByTestId("new-page-create-button"));
        await waitFor(() => expect(mocks.error).toHaveBeenLastCalledWith(id ? "Tidak dapat membuat halaman." : "Could not create the page."));
        fireEvent.click(screen.getByTestId("new-page-create-button"));
        await waitFor(() => expect(mocks.error).toHaveBeenLastCalledWith("Authored backend detail"));
        fireEvent.click(screen.getByTestId("new-page-create-button"));
        await waitFor(() => expect(mocks.success).toHaveBeenCalledWith(id ? "Halaman dibuat." : "Page created."));
        expect(mocks.apiPost).toHaveBeenLastCalledWith("/admin/pages", { slug: "new-slug", title: "Authored new title" });
    });
});

describe("page builder controls and settings locale", () => {
    it.each(modes)("localizes builder controls without changing authored properties in %s", async (mode) => {
        const id = mode === "id";
        await openBuilder(mode);
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Authored CMS title");
        expect(screen.getByText(/\/authored-slug ·/)).toHaveTextContent(id ? "Status: draf" : "Status: draft");
        expect(screen.getByTestId("page-back-button")).toHaveTextContent(id ? "Semua halaman" : "All pages");
        expect(screen.getByTestId("page-preview-link")).toHaveTextContent(id ? "Pratinjau" : "Preview");
        expect(screen.getByTestId("page-preview-link")).toHaveAttribute("href", "/p/authored-slug?preview=p1");
        expect(screen.getByTestId("page-revisions-button")).toHaveTextContent(id ? "Revisi" : "Revisions");
        expect(screen.getByTestId("page-publish-button")).toHaveTextContent(id ? "Terbitkan" : "Publish");
        expect(screen.getByTestId("block-title-image-1")).toHaveTextContent(id ? "Gambar" : "Image");
        expect(screen.getByTestId("block-title-gallery-1")).toHaveTextContent(id ? "Galeri · tersembunyi" : "Gallery · hidden");
        expect(screen.getByTestId("block-title-plugin-1")).toHaveTextContent("plugin_type");
        expect(screen.getByTestId("block-up-image-1")).toHaveAccessibleName(id ? "Pindahkan ke atas" : "Move up");
        expect(screen.getByTestId("block-up-image-1")).toBeDisabled();
        expect(screen.getByTestId("block-down-image-1")).toHaveAccessibleName(id ? "Pindahkan ke bawah" : "Move down");
        expect(screen.getByTestId("block-toggle-image-1")).toHaveAccessibleName(id ? "Sembunyikan widget" : "Hide widget");
        expect(screen.getByTestId("block-toggle-gallery-1")).toHaveAccessibleName(id ? "Tampilkan widget" : "Show widget");
        expect(screen.getByTestId("block-duplicate-image-1")).toHaveAccessibleName(id ? "Duplikasi widget" : "Duplicate widget");
        expect(screen.getByTestId("block-edit-image-1")).toHaveTextContent(id ? "Pengaturan" : "Settings");
        fireEvent.click(screen.getByTestId("block-edit-image-1"));
        expect(screen.getByText(id ? "Gambar Blok" : "Block Image")).toBeInTheDocument();
        expect(screen.getByText(id ? "Pengaturan & Properti Widget" : "Widget Settings & Properties")).toBeInTheDocument();
        expect(screen.getByText(id
            ? "Properti teks berakhiran _id berisi versi bahasa Indonesia. Gunakan </> JSON Mentah untuk struktur bertingkat atau tampilan mentah."
            : "Text properties ending in _id hold the Indonesian version. Use </> Raw JSON for nested structures or raw view.")).toBeInTheDocument();
        const raw = screen.getByLabelText(id ? "JSON properti widget" : "Widget properties JSON");
        expect(JSON.parse((raw as HTMLTextAreaElement).value)).toEqual(builderPage.blocks[0].props);
        fireEvent.change(raw, { target: { value: "{broken" } });
        expect(screen.getByRole("alert")).toHaveTextContent(id
            ? "JSON tidak valid: periksa tanda kurung dan koma."
            : "Invalid JSON: check brackets and commas.");
        expect(screen.getByTestId("block-props-save-image-1")).toHaveTextContent(id ? "Simpan pengaturan" : "Save settings");
        expect(screen.getByTestId("block-props-save-image-1")).toBeDisabled();
        fireEvent.change(raw, { target: { value: JSON.stringify(builderPage.blocks[0].props) } });
        fireEvent.click(screen.getByTestId("block-props-save-image-1"));
        await waitFor(() => expect(mocks.apiPatch).toHaveBeenCalledWith("/admin/pages/p1/blocks/image-1", { props: builderPage.blocks[0].props }));
        fireEvent.click(screen.getByTestId("block-edit-gallery-1"));
        expect(screen.getByText(id ? "Gambar Galeri" : "Gallery Images")).toBeInTheDocument();
    });

    it.each(modes)("localizes all widget library choices in %s", async (mode) => {
        const id = mode === "id";
        await openBuilder(mode);
        expect(screen.getByTestId("add-widget-button")).toHaveTextContent(id ? "Tambah widget" : "Add widget");
        fireEvent.click(screen.getByTestId("add-widget-button"));
        expect(screen.getByText(id ? "Pilih widget" : "Choose a widget")).toBeInTheDocument();
        const entries = [
            ["hero", "Hero", "Hero"], ["inner_hero", "Inner-page hero", "Hero halaman dalam"],
            ["rich_text", "Rich text", "Teks kaya"], ["image", "Image", "Gambar"],
            ["gallery", "Gallery", "Galeri"], ["video", "Video", "Video"],
            ["feature_tiles", "Feature tiles", "Ubin fitur"], ["stats", "Stats counters", "Penghitung statistik"],
            ["numbered_cards", "Numbered cards", "Kartu bernomor"], ["about", "About section", "Bagian tentang"],
            ["carousel", "Carousel", "Karusel"], ["quick_links", "Quick links", "Tautan cepat"],
            ["member_sections", "Member sections", "Bagian anggota"], ["news_feed", "News feed", "Umpan berita"],
            ["partners", "Partner logos", "Logo mitra"], ["cta_band", "Call-to-action band", "Pita ajakan bertindak"],
            ["contact_panel", "Contact panel", "Panel kontak"], ["contact_form", "Contact form", "Formulir kontak"],
            ["map", "Map", "Peta"], ["timeline", "Timeline", "Linimasa"], ["accordion", "Accordion", "Akordeon"],
            ["download_list", "Download list", "Daftar unduhan"], ["html", "Custom HTML", "HTML khusus"],
        ];
        for (const [type, en, indonesian] of entries) {
            expect(within(screen.getByTestId(`widget-option-${type}`)).getByText(id ? indonesian : en)).toBeInTheDocument();
        }
        expect(screen.getByTestId("widget-option-hero")).toHaveTextContent(id
            ? "Panel pembuka besar dengan lencana, judul, dan dua tombol."
            : "Big opening panel with a badge, title and two buttons.");
        expect(screen.getByTestId("widget-option-html")).toHaveTextContent(id
            ? "Lanjutan: HTML mentah yang dibersihkan otomatis."
            : "Advanced: raw HTML, cleaned automatically.");
        fireEvent.click(screen.getByTestId("widget-option-rich_text"));
        await waitFor(() => expect(mocks.apiPost).toHaveBeenCalledWith("/admin/pages/p1/blocks", { type: "rich_text", props: {} }));
    });

    it.each(modes)("localizes the empty builder in %s", async (mode) => {
        await openBuilder(mode, page);
        expect(screen.getByTestId("page-builder-empty")).toHaveTextContent(mode === "id"
            ? "Halaman ini belum memiliki widget. Klik “Tambah widget” untuk memulai."
            : "This page has no widgets yet. Click “Add widget” to start.");
    });
});

describe("page builder feedback and confirmation locale", () => {
    it.each(modes)("localizes widget action feedback and confirmation without changing payloads in %s", async (mode) => {
        const id = mode === "id";
        await openBuilder(mode);
        fireEvent.click(screen.getByTestId("block-down-image-1"));
        await waitFor(() => expect(mocks.success).toHaveBeenLastCalledWith(id ? "Urutan diperbarui." : "Order updated."));
        expect(mocks.apiPost).toHaveBeenLastCalledWith("/admin/pages/p1/reorder", { order: ["gallery-1", "image-1", "plugin-1"] });
        fireEvent.click(screen.getByTestId("block-toggle-image-1"));
        await waitFor(() => expect(mocks.success).toHaveBeenLastCalledWith(id ? "Widget disembunyikan." : "Widget hidden."));
        expect(mocks.apiPatch).toHaveBeenLastCalledWith("/admin/pages/p1/blocks/image-1", { hidden: true });
        fireEvent.click(screen.getByTestId("block-toggle-gallery-1"));
        await waitFor(() => expect(mocks.success).toHaveBeenLastCalledWith(id ? "Widget ditampilkan." : "Widget shown."));
        expect(mocks.apiPatch).toHaveBeenLastCalledWith("/admin/pages/p1/blocks/gallery-1", { hidden: false });
        fireEvent.click(screen.getByTestId("block-duplicate-image-1"));
        await waitFor(() => expect(mocks.success).toHaveBeenLastCalledWith(id ? "Widget diduplikasi." : "Widget duplicated."));
        expect(mocks.apiPost).toHaveBeenLastCalledWith("/admin/pages/p1/blocks/image-1/duplicate");
        fireEvent.click(screen.getByTestId("add-widget-button"));
        fireEvent.click(screen.getByTestId("widget-option-rich_text"));
        await waitFor(() => expect(mocks.success).toHaveBeenLastCalledWith(id ? "Widget ditambahkan." : "Widget added."));
        fireEvent.click(screen.getByTestId("block-edit-image-1"));
        fireEvent.click(screen.getByTestId("block-props-save-image-1"));
        await waitFor(() => expect(mocks.success).toHaveBeenLastCalledWith(id ? "Widget diperbarui." : "Widget updated."));
        expect(screen.getByTestId("block-delete-image-1")).toHaveTextContent(id ? "Hapus" : "Remove");
        fireEvent.click(screen.getByTestId("block-delete-image-1"));
        const question = id ? "Hapus widget ini?" : "Remove this widget?";
        expect(screen.getByRole("dialog", { name: question })).toBeInTheDocument();
        expect(screen.getByTestId("block-delete-image-1-confirm")).toHaveTextContent(id ? "Hapus widget" : "Remove it");
        fireEvent.click(screen.getByTestId("block-delete-image-1-cancel"));
        expect(mocks.apiDelete).not.toHaveBeenCalled();
        fireEvent.click(screen.getByTestId("block-delete-image-1"));
        fireEvent.click(screen.getByTestId("block-delete-image-1-confirm"));
        await waitFor(() => expect(mocks.success).toHaveBeenLastCalledWith(id ? "Widget dihapus." : "Widget removed."));
        expect(mocks.apiDelete).toHaveBeenCalledWith("/admin/pages/p1/blocks/image-1");
    });

    it.each(modes)("localizes publication and revision feedback in %s", async (mode) => {
        const id = mode === "id";
        await openBuilder(mode);
        fireEvent.click(screen.getByTestId("page-publish-button"));
        await waitFor(() => expect(mocks.success).toHaveBeenLastCalledWith(id ? "Halaman diterbitkan." : "Page published."));
        expect(mocks.apiPatch).toHaveBeenLastCalledWith("/admin/pages/p1", { status: "published" });
        fireEvent.click(screen.getByTestId("page-revisions-button"));
        expect(await screen.findByText(id ? "Belum ada versi sebelumnya." : "No earlier versions yet.")).toBeInTheDocument();
        fireEvent.click(screen.getByTestId("page-revisions-button"));
        mocks.apiGet.mockResolvedValue({ items: [{ id: "r1", saved_at: "2026-01-01T00:00:00Z", saved_by: "", title: "Authored revision", block_count: 3 }], total: 1 });
        fireEvent.click(screen.getByTestId("page-revisions-button"));
        const revision = await screen.findByTestId("revision-r1");
        expect(revision).toHaveTextContent(id ? "tidak diketahui · 3 widget" : "unknown · 3 widget(s)");
        expect(screen.getByTestId("revision-restore-r1")).toHaveTextContent(id ? "Pulihkan" : "Restore");
        fireEvent.click(screen.getByTestId("revision-restore-r1"));
        await waitFor(() => expect(mocks.success).toHaveBeenLastCalledWith(id ? "Versi dipulihkan." : "Version restored."));
        expect(mocks.apiPost).toHaveBeenLastCalledWith("/admin/pages/p1/revisions/r1/restore");
    });

    it.each(modes)("localizes unpublish and failed mutations while preserving server issues in %s", async (mode) => {
        const id = mode === "id";
        await openBuilder(mode, { ...builderPage, status: "published" });
        expect(screen.getByTestId("page-unpublish-button")).toHaveTextContent(id ? "Batalkan terbit" : "Unpublish");
        fireEvent.click(screen.getByTestId("page-unpublish-button"));
        await waitFor(() => expect(mocks.success).toHaveBeenLastCalledWith(id ? "Penerbitan halaman dibatalkan." : "Page unpublished."));
        expect(mocks.apiPatch).toHaveBeenLastCalledWith("/admin/pages/p1", { status: "draft" });
        mocks.apiPatch.mockRejectedValueOnce(new Error("offline"));
        fireEvent.click(screen.getByTestId("page-unpublish-button"));
        await waitFor(() => expect(mocks.error).toHaveBeenLastCalledWith(id ? "Tidak dapat menyimpan perubahan tersebut." : "Could not save that change."));
        mocks.apiPatch.mockRejectedValueOnce(new ApiError(422, { detail: { message: "Authored server detail", issues: [{ field: "props.title", severity: "error", code: "authored", message: "Authored issue", hint: "Authored hint" }] } }));
        fireEvent.click(screen.getByTestId("page-unpublish-button"));
        await waitFor(() => expect(mocks.error).toHaveBeenLastCalledWith("Authored server detail"));
        expect(screen.getByText(id ? "Halaman ini belum dapat diterbitkan" : "This page cannot be published yet")).toBeInTheDocument();
        expect(screen.getByTestId("page-builder-issues")).toHaveTextContent("Authored issue");
        expect(screen.getByTestId("page-builder-issues")).toHaveTextContent("Authored hint");
    });

    it.each(modes)("localizes builder loading and fallback errors in %s", async (mode) => {
        const id = mode === "id";
        mocks.apiGet.mockImplementation((url: string) => url === "/admin/pages" ? Promise.resolve({ items: [page], total: 1 }) : new Promise(() => {}));
        const view = mount(<PagesList />, mode);
        fireEvent.click(await screen.findByTestId("page-card-authored-slug"));
        expect(screen.getByText(id ? "Memuat halaman…" : "Loading page…")).toBeInTheDocument();
        view.unmount();
        mocks.apiGet.mockImplementation(async (url: string) => {
            if (url === "/admin/pages") return { items: [page], total: 1 };
            throw new Error("offline");
        });
        mount(<PagesList />, mode);
        fireEvent.click(await screen.findByTestId("page-card-authored-slug"));
        expect(await screen.findByRole("alert")).toHaveTextContent(id ? "Tidak dapat memuat halaman ini." : "Could not load this page.");
    });
});

const photoSlots: LabPhotoSlots = {
    illustrative_count: 2,
    slots: [
        { id: "stock", label: "Authored stock label", hint: "Authored stock hint", url: "/stock.webp", alt: "Authored alt", is_illustrative: true, has_photo: true },
        { id: "own", label: "Authored own label", hint: "Authored own hint", url: "/own.webp", alt: null, is_illustrative: false, has_photo: true },
        { id: "empty", label: "Authored empty label", hint: "Authored empty hint", is_illustrative: false, has_photo: false },
    ],
};

describe("lab photo screen locale", () => {
    it.each(modes)("localizes photo controls while preserving authored metadata in %s", async (mode) => {
        const id = mode === "id";
        mocks.apiGet.mockResolvedValue(photoSlots);
        mount(<LabPhotosPage />, mode);
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(id ? "Foto lab" : "Lab photos");
        expect(screen.getByText(id
            ? "Ganti gambar jaringan stok dengan foto Ruang B-301 milik Anda."
            : "Replace the stock networking imagery with your own photographs of Room B-301.")).toBeInTheDocument();
        const stock = await screen.findByTestId("lab-photo-slot-stock");
        expect(stock).toHaveTextContent("Authored stock label");
        expect(stock).toHaveTextContent("Authored stock hint");
        expect(within(stock).getByRole("img")).toHaveAttribute("alt", "Authored alt");
        expect(screen.getByTestId("lab-photo-illustrative-stock")).toHaveTextContent(id ? "Foto stok" : "Stock photo");
        expect(screen.getByTestId("lab-photo-real-own")).toHaveTextContent(id ? "Foto Anda" : "Your photo");
        expect(within(screen.getByTestId("lab-photo-slot-own")).getByRole("img")).toHaveAttribute("alt", "Authored own label");
        expect(screen.getByTestId("lab-photo-slot-empty")).toHaveTextContent(id ? "Kosong" : "Empty");
        expect(within(stock).getByLabelText(id ? "Foto" : "Photo")).toHaveAttribute("accept", "image/jpeg,image/png,image/webp");
        expect(within(stock).getByLabelText(id ? "Apa yang ditampilkan?" : "What does it show?"))
            .toHaveAttribute("placeholder", id ? "Mahasiswa mengonfigurasi router di Ruang B-301" : "Students configuring routers in Room B-301");
        expect(screen.getByTestId("lab-photo-upload-stock")).toHaveTextContent(id ? "Ganti" : "Replace");
        expect(screen.getByTestId("lab-photo-clear-stock")).toHaveAccessibleName(id ? "Bersihkan Authored stock label" : "Clear Authored stock label");
        expect(screen.getByTestId("lab-photos-stock-warning")).toHaveTextContent(id
            ? "2 slot masih menampilkan foto stok, dengan keterangan di situs “bukan foto Ruang B-301”. Unggah foto asli agar keterangan tersebut hilang secara otomatis."
            : "2 slots still show a stock photo, captioned on the site as “not a photo of Room B-301”. Upload a real photo and that caption disappears automatically.");
    });

    it.each(modes)("localizes singular stock warnings and photo loading in %s", async (mode) => {
        const id = mode === "id";
        mocks.apiGet.mockReturnValue(new Promise(() => {}));
        const view = mount(<LabPhotosPage />, mode);
        expect(screen.getByText(id ? "Memuat slot foto…" : "Loading photo slots…")).toBeInTheDocument();
        view.unmount();
        mocks.apiGet.mockResolvedValue({ ...photoSlots, illustrative_count: 1 });
        mount(<LabPhotosPage />, mode);
        expect(await screen.findByTestId("lab-photos-stock-warning")).toHaveTextContent(id ? "1 slot masih menampilkan" : "1 slot still shows a stock photo");
    });

    it.each(modes)("localizes upload validation, fallback and success but preserves backend errors in %s", async (mode) => {
        const id = mode === "id";
        mocks.apiGet.mockResolvedValue(photoSlots);
        const fetchMock = vi.fn()
            .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
            .mockResolvedValueOnce({ ok: false, json: async () => ({ detail: "Authored upload detail" }) })
            .mockResolvedValueOnce({ ok: true });
        vi.stubGlobal("fetch", fetchMock);
        mount(<LabPhotosPage />, mode);
        const upload = await screen.findByTestId("lab-photo-upload-empty");
        fireEvent.click(upload);
        expect(mocks.error).toHaveBeenLastCalledWith(id ? "Pilih foto terlebih dahulu." : "Choose a photo first.");
        const file = new File(["image"], "authored.png", { type: "image/png" });
        fireEvent.change(screen.getByTestId("lab-photo-file-empty"), { target: { files: [file] } });
        fireEvent.click(upload);
        expect(mocks.error).toHaveBeenLastCalledWith(id
            ? "Jelaskan isi foto — deskripsi ini dibacakan bagi pengunjung yang menggunakan pembaca layar."
            : "Describe what the photo shows — it is read aloud to visitors using a screen reader.");
        expect(fetchMock).not.toHaveBeenCalled();
        fireEvent.change(screen.getByTestId("lab-photo-alt-empty"), { target: { value: "  Authored upload alt  " } });
        fireEvent.click(upload);
        await waitFor(() => expect(mocks.error).toHaveBeenLastCalledWith(id ? "Tidak dapat mengunggah foto tersebut." : "Could not upload that photo."));
        fireEvent.click(upload);
        await waitFor(() => expect(mocks.error).toHaveBeenLastCalledWith("Authored upload detail"));
        fireEvent.click(upload);
        await waitFor(() => expect(mocks.success).toHaveBeenLastCalledWith(id ? "Authored empty label kini menampilkan foto Anda." : "Authored empty label now shows your photo."));
        const [url, options] = fetchMock.mock.calls[0];
        expect(url).toBe("/api/admin/lab-photos/empty");
        expect(options.method).toBe("POST");
        expect(options.body.get("alt")).toBe("Authored upload alt");
        expect(options.body.get("file").name).toBe("authored.png");
    });

    it.each(modes)("localizes photo clearing feedback in %s", async (mode) => {
        const id = mode === "id";
        mocks.apiGet.mockResolvedValue(photoSlots);
        mocks.apiDelete.mockRejectedValueOnce(new Error("offline"))
            .mockRejectedValueOnce(new ApiError(400, { detail: "Authored clear detail" }))
            .mockResolvedValueOnce({ ok: true });
        mount(<LabPhotosPage />, mode);
        const clear = await screen.findByTestId("lab-photo-clear-own");
        fireEvent.click(clear);
        await waitFor(() => expect(mocks.error).toHaveBeenLastCalledWith(id ? "Tidak dapat membersihkan slot ini." : "Could not clear this slot."));
        fireEvent.click(clear);
        await waitFor(() => expect(mocks.error).toHaveBeenLastCalledWith("Authored clear detail"));
        fireEvent.click(clear);
        await waitFor(() => expect(mocks.success).toHaveBeenLastCalledWith(id ? "Foto dihapus dari slot ini." : "Photo removed from this slot."));
        expect(mocks.apiDelete).toHaveBeenLastCalledWith("/admin/lab-photos/own");
    });
});

const crossrefHits = [
    { doi: "10.1/authored", title: "Authored publication title", authors: "Authored authors", venue: "Authored venue", year: 2025, ptype: "journal-article", abstract: "Authored abstract", citations: 2, already_imported: false },
    { doi: "10.1/existing", title: "Existing authored title", authors: "", venue: "Authored second venue", year: null, ptype: "proceedings-article", abstract: "", citations: 0, already_imported: true },
];

describe("publication import locale", () => {
    it.each(modes)("localizes publication search controls and explanatory copy in %s", (mode) => {
        const id = mode === "id";
        mount(<PublicationImportPage />, mode);
        expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(id ? "Impor publikasi" : "Import publications");
        expect(screen.getByText(id
            ? "Cari di Crossref berdasarkan penulis atau judul dan impor makalah dengan DOI terkonfirmasi — tanpa mengetik ulang."
            : "Search Crossref by author or title and bring papers in with their confirmed DOI — no typing.")).toBeInTheDocument();
        expect(screen.getByTestId("import-source-note")).toHaveTextContent(id ? "Makalah diambil dari Crossref, registri penerbit DOI." : "Papers are read from Crossref, the registry that issues DOIs.");
        expect(screen.getByTestId("import-source-note")).toHaveTextContent(id
            ? "Hasil impor masuk sebagai draf untuk Anda periksa sebelum ditampilkan di situs."
            : "Imports arrive as drafts for you to check before they appear on the site.");
        expect(screen.getByLabelText(id ? "Nama penulis" : "Author name")).toHaveValue("Achmad Affandi");
        expect(screen.getByLabelText(id ? "Judul atau kata kunci (opsional)" : "Title or keyword (optional)"))
            .toHaveAttribute("placeholder", id ? "jaringan akustik bawah air" : "underwater acoustic network");
        expect(screen.getByLabelText(id ? "Diterbitkan sejak" : "Published from")).toHaveValue("2023");
        expect(screen.getByTestId("import-search-button")).toHaveTextContent(id ? "Cari" : "Search");
        expect(screen.getByText(id ? "Cari penulis untuk melihat makalah yang terdaftar." : "Search for an author to see their registered papers.")).toBeInTheDocument();
    });

    it.each(modes)("localizes search results and import feedback while preserving research data in %s", async (mode) => {
        const id = mode === "id";
        mocks.apiGet.mockResolvedValue({ items: crossrefHits, total: 2 });
        mocks.apiPost.mockRejectedValueOnce(new Error("offline"))
            .mockRejectedValueOnce(new ApiError(400, { detail: "Authored import detail" }))
            .mockResolvedValueOnce({ imported: [{ id: "import-1", title: "Authored publication title", year: 2025, doi: "10.1/authored", blocking_issues: 0 }], duplicates: ["10.1/duplicate"], failed: ["10.1/failed"], message: "1 imported as draft, 1 already in the library, 1 could not be read" });
        mount(<PublicationImportPage />, mode);
        fireEvent.change(screen.getByTestId("import-author-input"), { target: { value: " Authored researcher " } });
        fireEvent.change(screen.getByTestId("import-query-input"), { target: { value: " authored keyword " } });
        fireEvent.click(screen.getByTestId("import-search-button"));
        expect(await screen.findByTestId("import-result-count")).toHaveTextContent(id ? "2 makalah ditemukan" : "2 papers found");
        expect(mocks.apiGet).toHaveBeenCalledWith("/admin/publications/search?q=authored+keyword&author=Authored+researcher&year_from=2023");
        expect(screen.getByRole("columnheader", { name: id ? "Makalah" : "Paper" })).toBeInTheDocument();
        expect(screen.getByRole("columnheader", { name: id ? "Tahun" : "Year" })).toBeInTheDocument();
        expect(screen.getByRole("columnheader", { name: id ? "Jenis" : "Kind" })).toBeInTheDocument();
        const row = screen.getByTestId("import-row-10.1/authored");
        expect(row).toHaveTextContent("Authored publication title");
        expect(row).toHaveTextContent("Authored authors");
        expect(row).toHaveTextContent("Authored venue");
        expect(row).toHaveTextContent("journal-article");
        expect(within(row).getByRole("link", { name: "DOI 10.1/authored" })).toHaveAttribute("href", "https://doi.org/10.1/authored");
        expect(screen.getByTestId("import-row-10.1/existing")).toHaveTextContent(id ? "Penulis tidak dicantumkan" : "Authors not listed");
        expect(screen.getByTestId("import-already-10.1/existing")).toHaveTextContent(id ? "Sudah ada di pustaka" : "Already in library");
        expect(screen.getByTestId("import-check-10.1/existing")).toBeDisabled();
        expect(screen.getByTestId("import-selected-button")).toBeDisabled();
        fireEvent.click(screen.getByRole("switch", { name: `${id ? "Pilih" : "Select"} Authored publication title` }));
        expect(screen.getByTestId("import-selected-button")).toHaveTextContent(id ? "Impor 1 sebagai draf" : "Import 1 as draft");
        fireEvent.click(screen.getByTestId("import-selected-button"));
        await waitFor(() => expect(mocks.error).toHaveBeenLastCalledWith(id ? "Tidak dapat mengimpor makalah tersebut." : "Could not import those papers."));
        await waitFor(() => expect(screen.getByTestId("import-selected-button")).toBeEnabled());
        fireEvent.click(screen.getByTestId("import-selected-button"));
        await waitFor(() => expect(mocks.error).toHaveBeenLastCalledWith("Authored import detail"));
        await waitFor(() => expect(screen.getByTestId("import-selected-button")).toBeEnabled());
        fireEvent.click(screen.getByTestId("import-selected-button"));
        await waitFor(() => expect(mocks.success).toHaveBeenLastCalledWith(id
            ? "1 diimpor sebagai draf, 1 sudah ada di pustaka, 1 tidak dapat dibaca"
            : "1 imported as draft, 1 already in the library, 1 could not be read"));
        expect(mocks.apiPost).toHaveBeenLastCalledWith("/admin/publications/import", { dois: ["10.1/authored"] });
        await waitFor(() => expect(screen.getByTestId("import-selected-button")).toBeDisabled());
    });

    it.each(modes)("localizes empty searches in %s", async (mode) => {
        const id = mode === "id";
        mocks.apiGet.mockResolvedValue({ items: [], total: 0 });
        mount(<PublicationImportPage />, mode);
        fireEvent.click(screen.getByTestId("import-search-button"));
        expect(await screen.findByTestId("import-result-count")).toHaveTextContent(id ? "0 makalah ditemukan" : "0 papers found");
        expect(screen.getByText(id ? "Tidak ada makalah yang cocok dengan pencarian tersebut." : "No papers matched that search.")).toBeInTheDocument();
        expect(mocks.info).toHaveBeenCalledWith(id ? "Tidak ada makalah yang cocok. Coba nama atau kata kunci lain." : "No papers matched. Try a different name or keyword.");
        expect(screen.getByTestId("import-selected-button")).toHaveTextContent(id ? "Impor sebagai draf" : "Import as draft");
        expect(screen.getByTestId("import-selected-button")).toBeDisabled();
    });

    it.each(modes)("localizes singular result counts and import summaries in %s", async (mode) => {
        const id = mode === "id";
        mocks.apiGet.mockResolvedValue({ items: [crossrefHits[0]], total: 1 });
        mocks.apiPost.mockResolvedValue({ imported: [], duplicates: [], failed: [], message: "0 imported as draft" });
        mount(<PublicationImportPage />, mode);
        fireEvent.click(screen.getByTestId("import-search-button"));
        expect(await screen.findByTestId("import-result-count")).toHaveTextContent(id ? "1 makalah ditemukan" : "1 paper found");
        fireEvent.click(screen.getByTestId("import-check-10.1/authored"));
        fireEvent.click(screen.getByTestId("import-selected-button"));
        await waitFor(() => expect(mocks.success).toHaveBeenCalledWith(id ? "0 diimpor sebagai draf" : "0 imported as draft"));
    });

    it.each(modes)("localizes search failures but preserves backend detail in %s", async (mode) => {
        const id = mode === "id";
        mocks.apiGet.mockRejectedValueOnce(new Error("offline"))
            .mockRejectedValueOnce(new ApiError(400, { detail: "Authored search detail" }));
        mount(<PublicationImportPage />, mode);
        fireEvent.click(screen.getByTestId("import-search-button"));
        await waitFor(() => expect(mocks.error).toHaveBeenLastCalledWith(id ? "Tidak dapat mencari makalah." : "Could not search for papers."));
        await waitFor(() => expect(screen.getByTestId("import-search-button")).toBeEnabled());
        fireEvent.click(screen.getByTestId("import-search-button"));
        await waitFor(() => expect(mocks.error).toHaveBeenLastCalledWith("Authored search detail"));
    });
});
