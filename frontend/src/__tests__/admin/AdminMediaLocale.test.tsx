import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MediaPickerModal } from "@/components/admin/media/MediaPickerModal";
import { AdminLocaleProvider } from "@/lib/i18n/admin-i18n";
import { LocaleContext, STRINGS } from "@/lib/i18n/i18n";

const { apiGetMock, apiPatchMock, successMock, errorMock } = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  apiPatchMock: vi.fn(),
  successMock: vi.fn(),
  errorMock: vi.fn(),
}));
vi.mock("@/lib/api/api", () => ({ apiGet: apiGetMock, apiPatch: apiPatchMock }));
vi.mock("sonner", () => ({ toast: { success: successMock, error: errorMock } }));

const asset = {
  id: "locale-asset",
  filename: "training-rack.webp",
  original_name: "training-rack.png",
  url: "/api/media-files/practicum/training-rack.webp",
  alt: "Authored server rack description",
  folder: "practicum",
  kind: "image",
  content_type: "image/webp",
  bytes: 1024,
  size_bytes: 1024,
  width: 1920,
  height: 1080,
  used_in: 2,
  created_at: "2026-01-01T00:00:00Z",
};

type PickerLocale = "en" | "id" | "without-admin-provider";
const locales: PickerLocale[] = ["en", "id", "without-admin-provider"];

function renderPicker(locale: PickerLocale, mode: "single" | "multiple" = "single") {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const siteLocale = locale === "en" ? "en" : "id";
  const onSelect = vi.fn();
  const onOpenChange = vi.fn();
  const picker = <MediaPickerModal open defaultFolder="practicum" accept="all" mode={mode} onSelect={onSelect} onOpenChange={onOpenChange} />;
  const view = render(
    <QueryClientProvider client={queryClient}>
      <LocaleContext.Provider value={{ locale: siteLocale, setLocale: vi.fn(), t: (key) => STRINGS[siteLocale][key] }}>
        {locale === "without-admin-provider" ? picker : <AdminLocaleProvider>{picker}</AdminLocaleProvider>}
      </LocaleContext.Provider>
    </QueryClientProvider>,
  );
  return { ...view, onSelect, onOpenChange };
}

beforeEach(() => {
  vi.resetAllMocks();
  apiGetMock.mockResolvedValue({ items: [asset], folders: ["practicum"], total: 2, limit: 48, offset: 0 });
  apiPatchMock.mockImplementation((_url, payload) => Promise.resolve({ ...asset, ...payload }));
  vi.stubGlobal("fetch", vi.fn());
  vi.stubGlobal("URL", URL);
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:locale-preview") });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe.each(locales)("media picker locale: %s", (locale) => {
  const id = locale === "id";

  it("localizes library filters and pagination without changing option values", async () => {
    renderPicker(locale);
    await screen.findByTestId("media-item-locale-asset");
    expect(screen.getByTestId("media-picker-header")).toHaveClass("flex-wrap", "h-auto");
    expect(screen.getByRole("heading", { name: id ? "Pustaka Media" : "Media Library" })).toBeInTheDocument();
    expect(screen.getByText(id ? "Pilih satu" : "Single select")).toBeInTheDocument();
    expect(screen.getByTestId("media-picker-tab-library")).toHaveAccessibleName(id ? "Jelajahi Pustaka" : "Browse Library");
    expect(screen.getByTestId("media-picker-tab-upload")).toHaveAccessibleName(id ? "Unggah Baru" : "Upload New");
    expect(screen.getByTestId("media-picker-close")).toHaveAccessibleName(id ? "Tutup pemilih media" : "Close media picker");
    expect(screen.getByTestId("media-picker-close")).toHaveAttribute("title", id ? "Tutup" : "Close");
    const search = screen.getByRole("textbox", { name: id ? "Cari" : "Search" });
    fireEvent.change(search, { target: { value: "rack" } });
    fireEvent.click(screen.getByRole("button", { name: id ? "Hapus pencarian" : "Clear search" }));
    expect(search).toHaveValue("");
    const folders = screen.getByRole("combobox", { name: id ? "Filter berdasarkan folder" : "Filter by folder" });
    expect(folders).toHaveValue("practicum");
    expect(within(folders).getAllByRole("option").map((option) => [option.getAttribute("value"), option.textContent])).toEqual([
      ["all", id ? "Semua folder" : "All folders"],
      ["events", id ? "Acara & Program" : "Events & Programs"],
      ["members", id ? "Anggota" : "Members"],
      ["posts", id ? "Berita & Tulisan" : "News & Posts"],
      ["partners", id ? "Mitra" : "Partners"],
      ["practicum", id ? "Pelatihan" : "Training"],
      ["equipment", id ? "Peralatan Lab" : "Lab Equipment"],
      ["pages", id ? "Halaman" : "Pages"],
      ["general", id ? "Umum" : "General"],
    ]);
    const kinds = screen.getByRole("combobox", { name: id ? "Filter berdasarkan jenis" : "Filter by kind" });
    expect(within(kinds).getAllByRole("option").map((option) => [option.getAttribute("value"), option.textContent])).toEqual([
      ["all", id ? "Semua jenis" : "All kinds"], ["image", id ? "Gambar" : "Images"], ["document", id ? "Dokumen" : "Docs"],
    ]);
    expect(screen.getByTestId("media-picker-refresh")).toHaveAccessibleName(id ? "Muat ulang pustaka" : "Refresh library");
    expect(screen.getByTestId("media-picker-refresh")).toHaveAttribute("title", id ? "Muat ulang pustaka" : "Refresh library");
    expect(screen.getByText(id ? "1 dari 2" : "1 of 2")).toBeInTheDocument();
    expect(screen.getByTestId("load-more-media")).toHaveAccessibleName(id ? "Muat lebih banyak" : "Load more");
    expect(apiGetMock).toHaveBeenCalledWith("/admin/media?folder=practicum&limit=48");
  });

  it.each(["single", "multiple"] as const)("localizes the %s inspector and selection actions while preserving authored content", async (mode) => {
    const { onSelect } = renderPicker(locale, mode);
    expect(screen.getByText(id ? "Pilih aset untuk melihat detail" : "Select an asset to view details")).toBeInTheDocument();
    expect(screen.getByTestId("media-picker-summary")).toHaveTextContent(mode === "single"
      ? id ? "Belum ada yang dipilih" : "Nothing selected yet"
      : id ? "0 aset dipilih" : "0 asset(s) selected");
    fireEvent.click(await screen.findByTestId("media-item-locale-asset"));
    expect(screen.getByText(id ? "Nama berkas" : "Filename")).toBeInTheDocument();
    expect(screen.getByText(id ? "Ukuran" : "Size")).toBeInTheDocument();
    expect(screen.getByText(id ? "Dimensi" : "Dimensions")).toBeInTheDocument();
    expect(screen.getByText(id ? "Digunakan di" : "Used in")).toBeInTheDocument();
    expect(screen.getByText(id ? "2 tempat" : "2 place(s)")).toBeInTheDocument();
    expect(screen.getByText("1920 × 1080 px")).toBeInTheDocument();
    expect(screen.getByText(id ? "Pelatihan" : "Training", { selector: "span" })).toBeInTheDocument();
    expect(screen.getAllByAltText(asset.alt).every((image) => image.getAttribute("src") === asset.url)).toBe(true);
    const alt = screen.getByRole("textbox", { name: id ? "Teks alternatif (pembaca layar)" : "Alt text (screen readers)" });
    expect(alt).toHaveValue(asset.alt);
    expect(alt).toHaveAttribute("placeholder", id ? "Deskripsikan aset ini untuk pembaca layar..." : "Describe this asset for screen readers...");
    expect(screen.getByTestId("media-picker-summary")).toHaveTextContent(mode === "single"
      ? `${id ? "Dipilih" : "Selected"}: ${asset.original_name} · 1 KB`
      : id ? "1 aset dipilih" : "1 asset(s) selected");
    expect(screen.getByTestId("media-picker-insert-button")).toHaveAccessibleName(mode === "single"
      ? id ? "Gunakan Gambar Terpilih" : "Use Selected Image"
      : id ? "Sisipkan 1 Gambar" : "Insert 1 Images");
    expect(screen.getByTestId("media-picker-cancel")).toHaveAccessibleName(id ? "Batal" : "Cancel");
    let finishSave!: (value: typeof asset) => void;
    apiPatchMock.mockImplementationOnce(() => new Promise((resolve) => { finishSave = resolve; }));
    fireEvent.change(alt, { target: { value: "Authored revised description" } });
    fireEvent.click(screen.getByRole("button", { name: id ? "Simpan Teks Alternatif" : "Save Alt Text" }));
    expect(screen.getByTestId("media-picker-save-alt")).toHaveAccessibleName(id ? "Menyimpan..." : "Saving...");
    finishSave({ ...asset, alt: "Authored revised description" });
    await waitFor(() => expect(successMock).toHaveBeenCalledWith(id ? "Teks alternatif diperbarui." : "Alt text updated."));
    expect(apiPatchMock).toHaveBeenCalledWith("/admin/media/locale-asset", { alt: "Authored revised description" });
    fireEvent.click(screen.getByTestId("media-picker-insert-button"));
    expect(onSelect).toHaveBeenCalledWith([expect.objectContaining({ filename: asset.filename, url: asset.url, alt: "Authored revised description", folder: "practicum" })]);
  });

  it("localizes the library retry and empty result guidance", async () => {
    apiGetMock.mockRejectedValueOnce(new Error("Backend diagnostic must not be translated"));
    renderPicker(locale);
    expect(await screen.findByTestId("media-picker-error")).toHaveTextContent(id ? "Tidak dapat memuat pustaka media." : "Could not load the media library.");
    apiGetMock.mockResolvedValue({ items: [], folders: [], total: 0, limit: 48, offset: 0 });
    fireEvent.click(screen.getByRole("button", { name: id ? "Coba lagi" : "Retry" }));
    expect(await screen.findByText(id ? "Tidak ada aset media ditemukan" : "No media assets found")).toBeInTheDocument();
    expect(screen.getByText(id ? "Coba ubah kata pencarian atau unggah aset baru." : "Try adjusting your search terms or upload new assets.")).toBeInTheDocument();
  });

  it("localizes alt validation and save failure toasts", async () => {
    renderPicker(locale);
    fireEvent.click(await screen.findByTestId("media-item-locale-asset"));
    fireEvent.change(screen.getByTestId("media-picker-alt-input"), { target: { value: " " } });
    fireEvent.click(screen.getByTestId("media-picker-save-alt"));
    expect(errorMock).toHaveBeenCalledWith(id ? "Teks alternatif tidak boleh kosong." : "Alt text cannot be empty.");
    expect(apiPatchMock).not.toHaveBeenCalled();
    apiPatchMock.mockRejectedValueOnce(new Error("save failed"));
    fireEvent.change(screen.getByTestId("media-picker-alt-input"), { target: { value: "Authored edit" } });
    fireEvent.click(screen.getByTestId("media-picker-save-alt"));
    await waitFor(() => expect(errorMock).toHaveBeenCalledWith(id ? "Gagal memperbarui teks alternatif." : "Failed to update alt text."));
  });

  it.each(["single", "multiple"] as const)("localizes missing-alt guidance in %s mode, not the filename fallback", async (mode) => {
    apiGetMock.mockResolvedValue({ items: [{ ...asset, alt: "", folder: "Authored custom folder" }], total: 1, folders: [], limit: 48, offset: 0 });
    renderPicker(locale, mode);
    fireEvent.click(await screen.findByTestId("media-item-locale-asset"));
    expect(screen.getByText(id ? "Belum ada teks alternatif" : "No alt text yet")).toBeInTheDocument();
    expect(screen.getByText("Authored custom folder")).toBeInTheDocument();
    expect(within(screen.getByTestId("media-item-locale-asset")).getByRole("img")).toHaveAttribute("alt", asset.filename);
    expect(screen.getAllByAltText(asset.filename)).toHaveLength(2);
    expect(screen.getByTestId("media-picker-alt-input")).toHaveValue("");
  });

  it("localizes successful upload feedback while preserving the actual multipart values", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(asset), { status: 201 }));
    const { onSelect } = renderPicker(locale);
    await screen.findByTestId("media-item-locale-asset");
    fireEvent.click(screen.getByTestId("media-picker-tab-upload"));
    fireEvent.change(screen.getByTestId("media-picker-file-input"), { target: { files: [new File(["x"], "authored.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByTestId("media-picker-upload-submit"));
    await waitFor(() => expect(successMock).toHaveBeenCalledWith(id ? "Berhasil mengunggah 1 aset." : "Successfully uploaded 1 asset(s)."));
    expect(onSelect).toHaveBeenCalledWith([asset]);
    const payload = vi.mocked(fetch).mock.calls[0][1]!.body as FormData;
    expect(payload.get("folder")).toBe("practicum");
    expect(payload.get("auto_alt")).toBe("true");
    expect(payload.get("optimize")).toBe("true");
  });

  it.each([true, false])("localizes upload errors with backend detail present=%s without changing backend diagnostics", async (hasDetail) => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(hasDetail ? { detail: "Authored backend error" } : {}), { status: 422 }));
    renderPicker(locale);
    await screen.findByTestId("media-item-locale-asset");
    fireEvent.click(screen.getByTestId("media-picker-tab-upload"));
    fireEvent.change(screen.getByTestId("media-picker-file-input"), { target: { files: [new File(["x"], "authored.png", { type: "image/png" })] } });
    fireEvent.click(screen.getByTestId("media-picker-upload-submit"));
    const detail = hasDetail ? "Authored backend error" : id ? "Unggahan gagal (HTTP 422)" : "Upload failed (HTTP 422)";
    await waitFor(() => expect(errorMock).toHaveBeenCalledWith(`${id ? "Gagal mengunggah" : "Failed to upload"} authored.png: ${detail}`));
    expect(screen.getByRole("alert")).toHaveTextContent(detail);
  });

  it.each(["single", "multiple"] as const)("localizes %s upload controls and queue actions without altering file selection", async (mode) => {
    renderPicker(locale, mode);
    await screen.findByTestId("media-item-locale-asset");
    fireEvent.click(screen.getByTestId("media-picker-tab-upload"));
    expect(screen.getByTestId("media-picker-dropzone")).toHaveAccessibleName(id
      ? "Jatuhkan file di sini atau klik untuk menjelajahi — Jelajahi"
      : "Drop files here or click to browse — Browse");
    expect(screen.getByTestId("media-picker-drop-hint")).toHaveTextContent(id
      ? "JPG, PNG, WebP, GIF, atau dokumen akademik maksimal 10 MB."
      : "JPG, PNG, WebP, GIF, or academic docs up to 10 MB.");
    const folder = screen.getByRole("combobox", { name: "Folder" });
    expect(folder).toHaveValue("practicum");
    expect(within(folder).getByRole("option", { name: id ? "Pelatihan" : "Training" })).toHaveValue("practicum");
    expect(within(folder).getAllByRole("option").map((option) => option.getAttribute("value"))).toEqual(["events", "members", "posts", "partners", "practicum", "equipment", "pages", "general"]);
    expect(screen.getByRole("textbox", { name: id ? "Teks alternatif (Opsional)" : "Alt text (Optional)" })).toHaveAttribute("placeholder", id ? "Biarkan kosong untuk memakai nama berkas yang dirapikan" : "Leave blank to use clean filename");
    const optimize = screen.getByRole("switch", { name: id ? "Optimalkan otomatis ke WebP (disarankan)" : "Auto-optimize to WebP (recommended)" });
    expect(optimize).toBeChecked();
    expect(screen.getByText(id
      ? "Mengubah ukuran foto kamera hingga maksimal 1920px dan mengonversinya ke WebP yang ringan dan tajam."
      : "Resizes camera photos to 1920px max and converts to light, crisp WebP.")).toBeInTheDocument();
    expect(screen.getByTestId("media-picker-upload-submit")).toHaveAccessibleName(id ? "Unggah & Sisipkan" : "Upload & Insert");
    expect(screen.getByTestId("media-picker-upload-submit")).toBeDisabled();
    const files = [new File(["first"], "Authored first.png", { type: "image/png" }), new File(["second"], "Authored second.png", { type: "image/png" })];
    const fileInput = screen.getByTestId("media-picker-file-input");
    expect(fileInput.hasAttribute("multiple")).toBe(mode === "multiple");
    fireEvent.change(fileInput, { target: { files } });
    const count = mode === "single" ? 1 : 2;
    expect(screen.getByRole("heading", { name: `${id ? "Berkas untuk diunggah" : "Files to upload"} (${count})` })).toBeInTheDocument();
    expect(screen.getByTestId("media-picker-summary")).toHaveTextContent(`${count} ${id ? "berkas dalam antrean" : "file(s) queued"}`);
    expect(screen.getByRole("img", { name: files[0].name })).toHaveAttribute("src", "blob:locale-preview");
    fireEvent.click(screen.getByRole("button", { name: `${id ? "Hapus dari antrean" : "Remove from queue"}: ${files[0].name}` }));
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:locale-preview");
    expect(screen.getByTestId("media-picker-summary")).toHaveTextContent(`${count - 1} ${id ? "berkas dalam antrean" : "file(s) queued"}`);
    expect(fetch).not.toHaveBeenCalled();
  });
});
