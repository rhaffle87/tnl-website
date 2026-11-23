/**
 * TEMPORARY geometry harness — dev only, never shipped, deleted before commit.
 *
 * It mounts the real MediaPickerModal / AnnouncementPopup against a stubbed
 * fetch so a real browser can measure the rendered boxes. Layout bugs like the
 * crushed media picker are invisible in jsdom (no layout engine), so this is the
 * only honest way to prove the fix.
 *
 *   /geom.html?only=media        -> widescreen media picker
 *   /geom.html?only=announcement -> blocking announcement modal
 *   /geom.html?only=announcement&style=card -> non-blocking corner card
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import "./index.css";
import { LocaleProvider } from "@/components/site/SiteLayout";
import { AnnouncementPopup } from "@/components/site/Chrome";
import { MediaPickerModal } from "@/components/admin/media";

const params = new URLSearchParams(window.location.search);
const only = params.get("only") ?? "media";
const announcementStyle = params.get("style") ?? "modal";

const svg = (label: string) =>
    `data:image/svg+xml,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><rect width="100%" height="100%" fill="#c7d0d4"/><text x="24" y="72" font-size="56" font-family="sans-serif" fill="#22402f">${label}</text></svg>`
    )}`;

const assets = Array.from({ length: 12 }, (_, i) => ({
    id: `media-${i + 1}`,
    filename: `member_portrait_${i + 1}.webp`,
    original_name: `HFiuWsxaYAAP${i + 1}.jpg`,
    url: svg(`#${i + 1}`),
    alt: `Member portrait ${i + 1}`,
    folder: "members",
    kind: "image",
    content_type: "image/webp",
    bytes: 37120 + i * 540,
    size_bytes: 37120 + i * 540,
    width: 600,
    height: 797,
    used_in: 1,
    created_at: new Date().toISOString(),
}));

const SETTINGS = {
    announcement: {
        enabled: true,
        title: "Open House TNL 2026 registration is full",
        title_id: "Kuota Open House TNL 2026 sudah penuh",
        body: "All 30 seats for Open House Laboratorium TNL 2026 have been taken. Follow our news page for the next laboratory activities.",
        body_id: "Kuota penuh. Ikuti halaman Berita untuk kegiatan berikutnya.",
        cta_label: "Latest news",
        cta_label_id: "Lihat berita",
        url: "/news",
        style: announcementStyle,
        version: 999,
    },
};

window.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const payload = url.includes("/media")
        ? { items: assets, folders: ["members", "events", "equipment", "general"], total: assets.length, limit: 48, offset: 0 }
        : SETTINGS;
    return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}) as typeof fetch;

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

createRoot(document.getElementById("root")!).render(
    <StrictMode>
        <QueryClientProvider client={queryClient}>
            <MemoryRouter initialEntries={["/member"]}>
                <LocaleProvider>
                    {only === "media" ? (
                        <MediaPickerModal
                            open
                            onOpenChange={() => {}}
                            mode="single"
                            onSelect={() => {}}
                            defaultFolder="members"
                        />
                    ) : (
                        <AnnouncementPopup />
                    )}
                </LocaleProvider>
            </MemoryRouter>
        </QueryClientProvider>
    </StrictMode>
);
