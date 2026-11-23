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
 *   /geom.html?only=editor&route=/admin/content/members/1 -> 2-column editor view
 *   /geom.html?only=editor&route=/admin/content/members   -> list view only
 */
import { StrictMode, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import "./index.css";
import { LocaleProvider } from "@/components/site/SiteLayout";
import { AnnouncementPopup } from "@/components/site/Chrome";
import { MediaPickerModal } from "@/components/admin/media";
import ContentManager from "@/pages/admin/ContentManager";
import ContentEditor from "@/pages/admin/ContentEditor";
import AdminLayout from "@/pages/admin/AdminLayout";

const params = new URLSearchParams(window.location.search);
const only = params.get("only") ?? "media";
const announcementStyle = params.get("style") ?? "modal";
const route = params.get("route") ?? "/admin/content/members/1";

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

const MEMBERS = [
    {
        id: "m-1",
        name: "Dr. Ir. Achmad Affandi, DEA.",
        role: "lecturer",
        position: "head",
        position_label: "Head of Laboratory",
        division: "BPH",
        batch: "",
        bio: "He leads the Telematics and Network Laboratory and teaches computer networks.",
        bio_id: "Beliau memimpin Laboratorium Telematika dan Jaringan serta mengajar jaringan komputer.",
        quote: "",
        quote_id: "",
        email_public: "affandi@its.ac.id",
        email_personal: "private@its.ac.id",
        photo_url: svg("AA"),
        photo_alt: "Portrait of Dr. Ir. Achmad Affandi",
        expertise: ["Computer Networks", "Telematics"],
        social: { linkedin: "https://linkedin.com/in/affandi" },
        projects: [],
        is_head: true,
        status: "active",
        nim: "",
        show_nim: false,
        show_personal_email: false,
        order: 1,
        published: true,
        updated_at: new Date().toISOString(),
    },
    {
        id: "m-2",
        name: "Assistant Coordinator",
        role: "assistant",
        position: "coordinator",
        position_label: "",
        division: "Academic",
        batch: "2026/2027",
        bio: "Coordinates practicum sessions.",
        bio_id: "Mengoordinasi sesi praktikum.",
        quote: "",
        quote_id: "",
        email_public: "assistant@its.ac.id",
        email_personal: "",
        photo_url: "",
        photo_alt: "",
        expertise: [],
        social: {},
        projects: [],
        is_head: false,
        status: "active",
        nim: "5023201001",
        show_nim: false,
        show_personal_email: false,
        order: 2,
        published: true,
        updated_at: new Date().toISOString(),
    },
];

window.fetch = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let payload: unknown = SETTINGS;
    if (url.includes("/auth/me")) {
        payload = { id: "u-1", name: "Rafli Alif", email: "admin@its.ac.id", role: "super_admin", divisions: [] };
    } else if (url.includes("/admin/content/")) {
        payload = { items: MEMBERS, total: MEMBERS.length, limit: 200, offset: 0 };
    } else if (url.includes("/admin/media") || url.includes("/media")) {
        payload = { items: assets, folders: ["members", "events", "equipment", "general"], total: assets.length, limit: 48, offset: 0 };
    } else if (url.includes("/public/members")) {
        payload = MEMBERS;
    }
    return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
}) as typeof fetch;

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function shell(children: React.ReactNode) {
    return (
        <StrictMode>
            <QueryClientProvider client={queryClient}>
                <MemoryRouter initialEntries={[only === "editor" ? route : "/member"]}>
                    <LocaleProvider>{children}</LocaleProvider>
                </MemoryRouter>
            </QueryClientProvider>
        </StrictMode>
    );
}

/** The real admin shell, so the editor is measured inside its true dual-scroll frame. */
function adminRoutes() {
    return (
        <Routes>
            <Route path="/admin" element={<AdminLayout />}>
                <Route path="content/:resource" element={<ContentManager />} />
                <Route path="content/:resource/new" element={<ContentEditor />} />
                <Route path="content/:resource/:id" element={<ContentEditor />} />
            </Route>
        </Routes>
    );
}

createRoot(document.getElementById("root")!).render(
    only === "media"
        ? shell(
              <MediaPickerModal
                  open
                  onOpenChange={() => {}}
                  mode="single"
                  onSelect={() => {}}
                  defaultFolder="members"
              />
          )
        : only === "editor"
          ? shell(adminRoutes())
          : shell(<AnnouncementPopup />)
);
