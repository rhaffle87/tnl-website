import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { MediaPickerModal } from "@/components/admin/media";
import { ADMIN_STRINGS, AdminLocaleProvider } from "@/lib/i18n/admin-i18n";
import { LocaleContext, STRINGS } from "@/lib/i18n/i18n";

// A6/A8 tail: the media picker still carried hardcoded English ("Asset Details",
// "JPG, PNG, WebP...") and hardcoded Indonesian ("Detail aset"). Both surfaces
// must resolve through the admin dictionary so the locale decides the copy.

vi.mock("@/lib/api/api", () => ({
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

function renderPicker(locale: "en" | "id" = "id") {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const value = {
        locale,
        setLocale: vi.fn(),
        t: (key: keyof typeof STRINGS.en) => STRINGS[locale][key] ?? STRINGS.en[key],
    };
    return render(
        <QueryClientProvider client={queryClient}>
            <LocaleContext.Provider value={value}>
                <AdminLocaleProvider>
                    <MediaPickerModal open onOpenChange={vi.fn()} onSelect={vi.fn()} />
                </AdminLocaleProvider>
            </LocaleContext.Provider>
        </QueryClientProvider>,
    );
}

afterEach(() => {
    window.localStorage.removeItem("tnl-locale");
    vi.restoreAllMocks();
});

describe("A6 — media picker copy is dictionary driven", () => {
    it("renders the asset inspector heading from the English dictionary", async () => {
        window.localStorage.setItem("tnl-locale", "en");
        const user = (await import("@testing-library/user-event")).default.setup();
        renderPicker("en");
        await user.click(await screen.findByTestId("media-item-media-1"));
        expect(screen.queryByText("Asset Details")).toBeNull();
        expect((await screen.findAllByText("Asset details")).length).toBe(2);
    });

    it("renders both inspector surfaces from the Indonesian dictionary", async () => {
        window.localStorage.setItem("tnl-locale", "id");
        const user = (await import("@testing-library/user-event")).default.setup();
        renderPicker();
        await user.click(await screen.findByTestId("media-item-media-1"));
        expect(screen.queryByText("Asset Details")).toBeNull();
        expect((await screen.findAllByText("Detail aset")).length).toBe(2);
    });

    it("localizes the dropzone file-type hint", async () => {
        window.localStorage.setItem("tnl-locale", "id");
        const user = (await import("@testing-library/user-event")).default.setup();
        renderPicker();
        await screen.findByTestId("media-item-media-1");
        await user.click(screen.getByTestId("media-picker-tab-upload"));
        await waitFor(() => {
            expect(screen.getByTestId("media-picker-drop-hint")).toBeInTheDocument();
        });
        expect(screen.getByTestId("media-picker-drop-hint").textContent).toBe(
            "JPG, PNG, WebP, GIF, atau dokumen akademik maksimal 10 MB.",
        );
    });

    it("localizes the queue remove control name", async () => {
        window.localStorage.setItem("tnl-locale", "id");
        Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:preview") });
        const user = (await import("@testing-library/user-event")).default.setup();
        renderPicker();
        await screen.findByTestId("media-item-media-1");
        await user.click(screen.getByTestId("media-picker-tab-upload"));
        const input = screen.getByTestId("media-picker-file-input");
        const { fireEvent } = await import("@testing-library/react");
        fireEvent.change(input, { target: { files: [new File(["x"], "photo.png", { type: "image/png" })] } });
        const remove = await screen.findByRole("button", { name: /Hapus dari antrean/ });
        expect(remove.getAttribute("aria-label")).toContain("antrean");
    });
});

describe("A6 — admin empty states resolve through the dictionary", () => {
    it("keeps empty states localized in the split admin screen modules", () => {
        const source = [
            "MediaLibraryPage.tsx",
            "RegistrarPage.tsx",
            "InboxPage.tsx",
            "UsersPage.tsx",
        ]
            .map((file) => readFileSync(resolve(process.cwd(), "src/pages/admin/screens", file), "utf8"))
            .join("\n");
        expect(source).not.toContain(">No files yet.<");
        expect(source).not.toContain(">No registrations yet.<");
        expect(source).not.toContain(">No messages yet.<");
        expect(source).not.toContain(">No accounts yet.<");
        ["adminMediaEmpty", "adminRegistrationsEmpty", "adminInboxEmpty", "adminAccountsEmpty"].forEach((key) => {
            expect(source).toContain(`t("${key}")`);
        });
    });

    it("keeps en/id parity for every key touched by this batch", () => {
        const keys = [
            "adminDropFileTypes",
            "adminRemoveFromQueue",
            "adminCoverAlt",
            "adminEventCoverAlt",
            "adminMediaEmpty",
            "adminRegistrationsEmpty",
            "adminInboxEmpty",
            "adminAccountsEmpty",
            "adminSearchMediaPlaceholder",
        ];
        keys.forEach((key) => {
            const k = key as keyof typeof ADMIN_STRINGS.en;
            expect(ADMIN_STRINGS.en[k], key).toBeTruthy();
            expect(ADMIN_STRINGS.id[k], key).toBeTruthy();
            expect(ADMIN_STRINGS.id[k], key).not.toBe(ADMIN_STRINGS.en[k]);
        });
    });
});

describe("A8 — editor cover alt text comes from the dictionary", () => {
    it("does not hardcode English alt text in ContentEditor", () => {
        const source = readFileSync(resolve(process.cwd(), "src/pages/admin/ContentEditor.tsx"), "utf8");
        expect(source).not.toContain('alt="Cover"');
        expect(source).not.toContain('alt="Event Cover"');
        expect(source).toContain('t("adminCoverAlt")');
        expect(source).toContain('t("adminEventCoverAlt")');
    });
});
