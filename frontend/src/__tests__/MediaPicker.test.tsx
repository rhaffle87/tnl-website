import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { InlineMediaField, MultiMediaField, MediaPickerModal } from "@/components/admin/media";

// Mock API calls
vi.mock("@/lib/api", () => ({
    apiGet: vi.fn().mockImplementation((url: string) => {
        if (url.includes("/admin/media")) {
            return Promise.resolve({
                items: [
                    {
                        id: "media-1",
                        filename: "lab_rack.webp",
                        original_name: "lab_rack.png",
                        url: "/api/media-files/equipment/lab_rack.webp",
                        key: "equipment/lab_rack.webp",
                        alt: "Server rack in room B-301",
                        folder: "equipment",
                        kind: "image",
                        content_type: "image/webp",
                        bytes: 142000,
                        size_bytes: 142000,
                        width: 1920,
                        height: 1080,
                        created_at: new Date().toISOString(),
                    },
                    {
                        id: "media-2",
                        filename: "open_house_poster.webp",
                        original_name: "open_house_poster.png",
                        url: "/api/media-files/events/open_house_poster.webp",
                        key: "events/open_house_poster.webp",
                        alt: "Open House 2026 Poster",
                        folder: "events",
                        kind: "image",
                        content_type: "image/webp",
                        bytes: 250000,
                        size_bytes: 250000,
                        width: 1200,
                        height: 1600,
                        created_at: new Date().toISOString(),
                    },
                ],
                folders: ["equipment", "events", "general", "members"],
                total: 2,
                limit: 48,
                offset: 0,
            });
        }
        return Promise.resolve({});
    }),
    apiPatch: vi.fn().mockImplementation((url: string, payload: any) => {
        return Promise.resolve({
            id: "media-1",
            alt: payload.alt,
            folder: payload.folder || "equipment",
        });
    }),
}));

function createTestQueryClient() {
    return new QueryClient({
        defaultOptions: {
            queries: {
                retry: false,
            },
        },
    });
}

describe("InlineMediaField Component", () => {
    it("renders empty dropzone when value is empty and toggles manual URL input", async () => {
        const user = userEvent.setup();
        const handleChange = vi.fn();

        render(
            <QueryClientProvider client={createTestQueryClient()}>
                <InlineMediaField
                    label="Cover Image"
                    value=""
                    onChange={handleChange}
                    defaultFolder="events"
                    testId="test-inline-media"
                />
            </QueryClientProvider>
        );

        expect(screen.getByText("Cover Image")).toBeInTheDocument();
        expect(screen.getByTestId("test-inline-media-dropzone")).toBeInTheDocument();

        // Toggle manual URL input
        const manualToggle = screen.getByTestId("test-inline-media-manual-toggle");
        await user.click(manualToggle);

        const manualInput = screen.getByTestId("test-inline-media-manual-input");
        expect(manualInput).toBeInTheDocument();

        await user.type(manualInput, "https://example.com/custom.png");
        expect(handleChange).toHaveBeenCalled();
    });

    it("renders thumbnail preview with Replace and Remove actions when value is provided", async () => {
        const user = userEvent.setup();
        const handleChange = vi.fn();

        render(
            <QueryClientProvider client={createTestQueryClient()}>
                <InlineMediaField
                    label="Member Photo"
                    value="/api/media-files/members/doni.webp"
                    onChange={handleChange}
                    defaultFolder="members"
                    testId="test-inline-media-filled"
                />
            </QueryClientProvider>
        );

        expect(screen.getByTestId("test-inline-media-filled-preview")).toBeInTheDocument();
        expect(screen.getByText("/api/media-files/members/doni.webp")).toBeInTheDocument();

        // Remove button clears value
        const removeBtn = screen.getByTestId("test-inline-media-filled-remove-btn");
        await user.click(removeBtn);
        expect(handleChange).toHaveBeenCalledWith("");
    });
});

describe("MultiMediaField Component", () => {
    it("renders thumbnail grid and allows reordering and removing items", async () => {
        const user = userEvent.setup();
        const handleChange = vi.fn();
        const initialUrls = [
            "/api/media-files/events/photo1.webp",
            "/api/media-files/events/photo2.webp",
            "/api/media-files/events/photo3.webp",
        ];

        render(
            <QueryClientProvider client={createTestQueryClient()}>
                <MultiMediaField
                    label="Gallery Images"
                    value={initialUrls}
                    onChange={handleChange}
                    defaultFolder="events"
                    testId="test-multi-media"
                />
            </QueryClientProvider>
        );

        expect(screen.getByTestId("test-multi-media-grid")).toBeInTheDocument();
        expect(screen.getByText("#1")).toBeInTheDocument();
        expect(screen.getByText("#2")).toBeInTheDocument();
        expect(screen.getByText("#3")).toBeInTheDocument();

        // Remove item #2
        const removeBtn1 = screen.getByTestId("test-multi-media-remove-1");
        await user.click(removeBtn1);
        expect(handleChange).toHaveBeenCalledWith([
            "/api/media-files/events/photo1.webp",
            "/api/media-files/events/photo3.webp",
        ]);

        // Move item #1 to right
        const moveRightBtn0 = screen.getByTestId("test-multi-media-move-right-0");
        await user.click(moveRightBtn0);
        expect(handleChange).toHaveBeenCalledWith([
            "/api/media-files/events/photo2.webp",
            "/api/media-files/events/photo1.webp",
            "/api/media-files/events/photo3.webp",
        ]);
    });
});

describe("MediaPickerModal Component", () => {
    it("renders assets in Media Library, switches tabs, and selects asset", async () => {
        const user = userEvent.setup();
        const handleSelect = vi.fn();
        const handleOpenChange = vi.fn();

        render(
            <QueryClientProvider client={createTestQueryClient()}>
                <MediaPickerModal
                    open={true}
                    onOpenChange={handleOpenChange}
                    mode="single"
                    onSelect={handleSelect}
                    defaultFolder="events"
                />
            </QueryClientProvider>
        );

        // Assets should be fetched and rendered
        await waitFor(() => {
            expect(screen.getByTestId("media-item-media-1")).toBeInTheDocument();
        });

        // Click first asset
        await user.click(screen.getByTestId("media-item-media-1"));

        // Detail pane displays asset details
        expect(screen.getAllByText("Server rack in room B-301").length).toBeGreaterThan(0);
        expect(screen.getByTestId("media-picker-insert-button")).toBeInTheDocument();

        // Click insert button
        await user.click(screen.getByTestId("media-picker-insert-button"));
        expect(handleSelect).toHaveBeenCalledWith([
            expect.objectContaining({ id: "media-1" }),
        ]);

        // Design System v2: the library filters are house selects (h-9 +
        // pinned chevron) — not the 46px `tnl-field` browser arrow.
        const folderSelect = screen.getByTestId("media-picker-folder") as HTMLSelectElement;
        expect(folderSelect.tagName).toBe("SELECT");
        expect(folderSelect.className).toContain("appearance-none");
        expect(folderSelect.className).toContain("h-9");
        expect(folderSelect.parentElement?.className).toContain("w-40");
        expect(folderSelect.parentElement?.querySelector("svg")).not.toBeNull();
        expect((screen.getByTestId("media-picker-kind") as HTMLSelectElement).className).toContain("appearance-none");

        // Switch to Upload tab
        const uploadTab = screen.getByTestId("media-picker-tab-upload");
        await user.click(uploadTab);
        expect(screen.getByTestId("media-picker-dropzone")).toBeInTheDocument();
        expect(screen.getByTestId("media-picker-optimize-check")).toBeInTheDocument();

        // …and the Auto-WebP boolean is a switch, not a raw checkbox.
        const optimize = screen.getByTestId("media-picker-optimize-check");
        expect(optimize).toHaveAttribute("role", "switch");
        expect(optimize).toHaveAttribute("aria-checked", "true");
        await user.click(optimize);
        expect(optimize).toHaveAttribute("aria-checked", "false");
        expect((screen.getByTestId("media-picker-upload-folder") as HTMLSelectElement).className).toContain("appearance-none");
    });
});
