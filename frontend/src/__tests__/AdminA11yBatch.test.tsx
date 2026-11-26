import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MediaPickerModal } from "@/components/admin/media";
import { ImageCropDialog } from "@/components/admin/media/ImageCropDialog";
import { RichTextField } from "@/components/admin/editor/RichTextField";
import { FormFieldsBuilder } from "@/components/admin/repeaters/FormFieldsBuilder";
import { KeyValueMapEditor } from "@/components/admin/repeaters/KeyValueMapEditor";
import { ObjectListRepeater } from "@/components/admin/repeaters/ObjectListRepeater";
import { fireEvent, act } from "@testing-library/react";

// The shared i18n module belongs to another shard. Mock it so these accessibility
// regressions can be exercised in isolation with deterministic English strings.
const TEST_STRINGS = vi.hoisted(() => ({
    adminDropFiles: "Drop files here",
    adminBrowse: "browse",
    adminSearch: "Search",
    adminFolder: "Folder",
    adminAltText: "Alt text",
    adminOptional: "Optional",
    adminUploading: "Uploading...",
    adminReady: "Ready",
    adminError: "Error",
    adminNothingSelected: "Nothing selected yet",
    adminSelected: "Selected",
    adminItems: "items",
    adminCrop: "Crop",
    adminGenericAlt: "Generic image",
    adminCancel: "Cancel",
    adminUpload: "Upload",
}));
vi.mock("@/lib/admin-i18n", () => ({
    ADMIN_STRINGS: { en: TEST_STRINGS, id: TEST_STRINGS },
    AdminLocaleProvider: ({ children }: { children: React.ReactNode }) => children,
    useAdminT: () => (key: keyof typeof TEST_STRINGS) => TEST_STRINGS[key] ?? String(key),
}));

vi.mock("@/lib/api", () => ({
    apiGet: vi.fn().mockResolvedValue({
        items: [
            {
                id: "media-1",
                filename: "lab_rack.webp",
                original_name: "lab_rack.png",
                url: "/api/media-files/equipment/lab_rack.webp",
                alt: "Server rack",
                folder: "equipment",
                kind: "image",
                size_bytes: 1000,
                bytes: 1000,
                created_at: new Date().toISOString(),
            },
        ],
        folders: ["general", "events"],
        total: 1,
        limit: 48,
        offset: 0,
    }),
    apiPatch: vi.fn().mockResolvedValue({ id: "media-1", alt: "updated" }),
}));

function renderPicker() {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
        <QueryClientProvider client={queryClient}>
            <MediaPickerModal open onOpenChange={vi.fn()} onSelect={vi.fn()} />
        </QueryClientProvider>,
    );
}

async function openUploadTab() {
    const user = userEvent.setup();
    await user.click(screen.getByTestId("media-picker-tab-upload"));
    return user;
}

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe("A1 — dropzone keyboard operability", () => {
    it("exposes the dropzone as a button named by the drop and browse labels", async () => {
        renderPicker();
        await openUploadTab();

        expect(screen.getByTestId("media-picker-dropzone")).toBe(
            screen.getByRole("button", { name: /Drop files here.*browse/i }),
        );
    });

    it("opens the file picker when Enter is pressed on the focused dropzone", async () => {
        renderPicker();
        const user = await openUploadTab();
        const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});

        screen.getByTestId("media-picker-dropzone").focus();
        await user.keyboard("{Enter}");

        expect(clickSpy).toHaveBeenCalled();
    });

    it("opens the file picker when Space is pressed on the focused dropzone", async () => {
        renderPicker();
        const user = await openUploadTab();
        const clickSpy = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});

        screen.getByTestId("media-picker-dropzone").focus();
        await user.keyboard(" ");

        expect(clickSpy).toHaveBeenCalled();
    });
});

describe("A3 — crop canvas keyboard support", () => {
    async function renderCropper(presetId?: string) {
        class FakeImage {
            crossOrigin = "";
            naturalWidth = 800;
            naturalHeight = 600;
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            set src(_src: string) {
                setTimeout(() => this.onload?.(), 0);
            }
        }
        vi.stubGlobal("Image", FakeImage);
        vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
            clearRect: vi.fn(),
            drawImage: vi.fn(),
            fillRect: vi.fn(),
            strokeRect: vi.fn(),
        } as unknown as CanvasRenderingContext2D);

        render(
            <ImageCropDialog
                open
                source={{ url: "blob:fake", suggestedName: "photo.png" }}
                onOpenChange={vi.fn()}
                onDone={vi.fn()}
            />,
        );
        await act(async () => {
            await Promise.resolve();
        });
        const canvas = await screen.findByTestId("image-crop-canvas");
        if (presetId) fireEvent.click(screen.getByTestId(`image-crop-preset-${presetId}`));
        return canvas;
    }

    it("makes the crop canvas focusable with an application role and a named frame", async () => {
        const canvas = await renderCropper();
        expect(canvas).toHaveAttribute("tabindex", "0");
        expect(canvas).toHaveAttribute("role", "application");
        expect(canvas).toHaveAccessibleName(/Crop.*x 0 y 0/i);
    });

    it("moves the crop frame one pixel right with ArrowRight", async () => {
        const canvas = await renderCropper("11");
        fireEvent.keyDown(canvas, { key: "ArrowRight" });
        expect(canvas).toHaveAccessibleName(/x 61 y 0/i);
    });

    it("moves the crop frame a larger step down with Shift+ArrowDown", async () => {
        const canvas = await renderCropper("169");
        fireEvent.keyDown(canvas, { key: "ArrowDown", shiftKey: true });
        expect(canvas).toHaveAccessibleName(/x 0 y 55/i);
    });
});

describe("A4 — validation errors announced", () => {
    const rawEditors = [
        {
            name: "FormFieldsBuilder",
            testId: "ffb-a4",
            node: <FormFieldsBuilder value={[]} onChange={vi.fn()} testId="ffb-a4" />,
        },
        {
            name: "KeyValueMapEditor",
            testId: "kvm-a4",
            node: <KeyValueMapEditor value={{}} onChange={vi.fn()} testId="kvm-a4" />,
        },
        {
            name: "ObjectListRepeater",
            testId: "olr-a4",
            node: <ObjectListRepeater value={[]} fields={[]} onChange={vi.fn()} testId="olr-a4" />,
        },
    ];

    function renderInvalidRaw(node: React.ReactElement, testId: string) {
        render(node);
        fireEvent.click(screen.getByTestId(`${testId}-raw-toggle`));
        const textarea = screen.getByTestId(`${testId}-raw-textarea`);
        fireEvent.change(textarea, { target: { value: "{not json" } });
        return textarea;
    }

    it.each(rawEditors)("$name exposes invalid JSON as an alert", ({ node, testId }) => {
        renderInvalidRaw(node, testId);
        expect(screen.getByTestId(`${testId}-raw-textarea`)).toBeInTheDocument();
        expect(screen.getByRole("alert")).toHaveTextContent(/json|expected|unexpected/i);
    });

    it.each(rawEditors)("$name marks its raw textarea invalid and links it to the error", ({ node, testId }) => {
        const textarea = renderInvalidRaw(node, testId);
        expect(textarea).toHaveAttribute("aria-invalid", "true");
        const describedBy = textarea.getAttribute("aria-describedby");
        expect(describedBy).toBeTruthy();
        expect(document.getElementById(describedBy!)).toBe(screen.getByRole("alert"));
    });

    async function renderInvalidLink() {
        const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
        render(
            <QueryClientProvider client={queryClient}>
                <RichTextField value="" onChange={vi.fn()} testId="rtf-a4" />
            </QueryClientProvider>,
        );
        await waitFor(() => expect(screen.getByTestId("rtf-a4-link")).not.toBeDisabled());
        fireEvent.click(screen.getByTestId("rtf-a4-link"));
        const input = screen.getByTestId("rtf-a4-link-input");
        fireEvent.change(input, { target: { value: "javascript:alert(1)" } });
        fireEvent.click(screen.getByTestId("rtf-a4-link-apply"));
        return input;
    }

    it("exposes the rich-text link error as an alert", async () => {
        await renderInvalidLink();
        expect(screen.getByRole("alert")).toBe(screen.getByTestId("rtf-a4-link-error"));
    });

    it("marks the invalid link input with aria-invalid", async () => {
        const input = await renderInvalidLink();
        expect(input).toHaveAttribute("aria-invalid", "true");
    });

    it("links the invalid link input to its error message", async () => {
        const input = await renderInvalidLink();
        const describedBy = input.getAttribute("aria-describedby");
        expect(describedBy).toBeTruthy();
        expect(document.getElementById(describedBy!)).toBe(screen.getByTestId("rtf-a4-link-error"));
    });
});

describe("A5 — upload status announced", () => {
    async function enqueueAndUpload(fetchImpl: () => Promise<Response>) {
        vi.stubGlobal("fetch", vi.fn(fetchImpl));
        Object.defineProperty(URL, "createObjectURL", {
            configurable: true,
            value: vi.fn(() => "blob:preview"),
        });
        const user = userEvent.setup();
        renderPicker();
        await waitFor(() => expect(screen.getByTestId("media-item-media-1")).toBeInTheDocument());
        await user.click(screen.getByTestId("media-picker-tab-upload"));
        fireEvent.change(screen.getByTestId("media-picker-file-input"), {
            target: { files: [new File(["x"], "photo.png", { type: "image/png" })] },
        });
        await user.click(screen.getByTestId("media-picker-upload-submit"));
    }

    it("exposes the picker summary as a polite status region", () => {
        renderPicker();
        const summary = screen.getByTestId("media-picker-summary");
        expect(summary).toHaveAttribute("role", "status");
        expect(summary).toHaveAttribute("aria-live", "polite");
    });

    it("localizes the empty summary text", () => {
        renderPicker();
        expect(screen.getByTestId("media-picker-summary")).toHaveTextContent(TEST_STRINGS.adminNothingSelected);
    });

    it("localizes the selected summary text", async () => {
        const user = userEvent.setup();
        renderPicker();
        const item = await screen.findByTestId("media-item-media-1");
        await user.click(item);
        expect(screen.getByTestId("media-picker-summary")).toHaveTextContent(TEST_STRINGS.adminSelected);
    });

    it("announces an in-progress upload in a polite status region", async () => {
        await enqueueAndUpload(() => new Promise<Response>(() => {}));
        const status = screen.getAllByRole("status").find((el) => el.textContent?.includes(TEST_STRINGS.adminUploading));
        expect(status).toHaveAttribute("aria-live", "polite");
    });

    it("announces a completed upload in a polite status region", async () => {
        await enqueueAndUpload(() =>
            Promise.resolve({
                ok: true,
                json: async () => ({ id: "new", filename: "photo.webp", url: "/photo.webp", alt: "photo" }),
            } as Response),
        );
        await waitFor(() => {
            const status = screen.getAllByRole("status").find((el) => el.textContent?.includes(TEST_STRINGS.adminReady));
            expect(status).toHaveAttribute("aria-live", "polite");
        });
    });

    it("announces a queue failure as an alert", async () => {
        await enqueueAndUpload(() =>
            Promise.resolve({
                ok: false,
                status: 500,
                json: async () => ({ detail: "disk full" }),
            } as Response),
        );
        await waitFor(() => {
            expect(screen.getByRole("alert")).toHaveTextContent(/disk full/i);
        });
    });
});

describe("A2 — accessible names for picker controls", () => {
    it("gives the library search field a translated accessible name", () => {
        renderPicker();
        expect(screen.getByTestId("media-picker-search")).toHaveAccessibleName(TEST_STRINGS.adminSearch);
    });

    it("gives the upload destination select a translated accessible name", async () => {
        renderPicker();
        await openUploadTab();
        expect(screen.getByTestId("media-picker-upload-folder")).toHaveAccessibleName(TEST_STRINGS.adminFolder);
    });

    it("associates the upload alt label with its input", async () => {
        renderPicker();
        await openUploadTab();
        expect(screen.getByTestId("media-picker-upload-alt")).toHaveAccessibleName(/Alt text/);
    });
});
