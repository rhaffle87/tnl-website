import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { ADMIN_SCREENS_STRINGS } from "@/lib/i18n/admin-screens-strings";
import { AdminLocaleProvider } from "@/lib/i18n/admin-i18n";
import { LocaleProvider } from "@/components/site/SiteLayout";
import AdminLayout from "@/pages/admin/AdminLayout";
import { AuditLogPage, MaintainerGuidePage, ReviewQueuePage } from "@/pages/admin/AdminDashboard";
import ContentEditor from "@/pages/admin/ContentEditor";
import { LabPhotosPage } from "@/pages/admin/LabConsentScreens";
import { ApiKeysPage } from "@/pages/admin/screens/ApiKeysPage";
import { InboxPage } from "@/pages/admin/screens/InboxPage";
import { RegistrarPage } from "@/pages/admin/screens/RegistrarPage";
import { SettingsPage } from "@/pages/admin/screens/SettingsPage";

const mocks = vi.hoisted(() => ({
    get: vi.fn(),
    post: vi.fn(),
    patch: vi.fn(),
    put: vi.fn(),
    remove: vi.fn(),
    me: { id: "sa-1", name: "Super Admin", email: "admin@its.ac.id", role: "super_admin", divisions: [] },
}));

vi.mock("@/lib/api/api", async (original) => ({
    ...await original<typeof import("@/lib/api/api")>(),
    apiGet: mocks.get,
    apiPost: mocks.post,
    apiPatch: mocks.patch,
    apiPut: mocks.put,
    apiDelete: mocks.remove,
}));
vi.mock("@/lib/api/hooks", () => ({ useMe: () => ({ data: mocks.me, isLoading: false, isError: false }), useSettings: () => ({ data: undefined }) }));
vi.mock("@/lib/api/session", () => ({ beginSession: vi.fn(), endSession: vi.fn() }));
vi.mock("@/lib/theme/theme", () => ({
    applyThemeTokens: vi.fn(),
    useApplyThemeTokens: vi.fn(),
    useThemeMode: () => ({ isDark: false, toggleTheme: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/admin/media", () => ({
    InlineMediaField: ({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) => (
        <input aria-label={label} value={value ?? ""} onChange={(e) => onChange(e.target.value)} />
    ),
    MultiMediaField: () => <div />,
}));
vi.mock("@/components/admin/editor", () => ({ RichTextField: () => <div /> }));

function mount(ui: ReactNode, { route = "/admin", locale }: { route?: string; locale?: "en" | "id" } = {}) {
    if (locale) localStorage.setItem("tnl-locale", locale);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
    const inner = locale ? (
        <LocaleProvider>
            <AdminLocaleProvider>{ui}</AdminLocaleProvider>
        </LocaleProvider>
    ) : ui;
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter initialEntries={[route]}>{inner}</MemoryRouter>
        </QueryClientProvider>,
    );
}

beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
    mocks.me = { id: "sa-1", name: "Super Admin", email: "admin@its.ac.id", role: "super_admin", divisions: [] };
    mocks.get.mockResolvedValue({ items: [], total: 0, counts: {} });
    mocks.post.mockResolvedValue({ ok: true });
    mocks.patch.mockResolvedValue({ ok: true });
    mocks.put.mockResolvedValue({ ok: true });
    mocks.remove.mockResolvedValue({ ok: true });
});

afterEach(() => cleanup());

describe("cleanup, reorganization, and missing CMS UI features", () => {
    it("maintains full EN/ID key parity in ADMIN_SCREENS_STRINGS", () => {
        const enKeys = Object.keys(ADMIN_SCREENS_STRINGS.en).sort();
        const idKeys = Object.keys(ADMIN_SCREENS_STRINGS.id).sort();
        expect(enKeys).toEqual(idKeys);
        expect(Object.values(ADMIN_SCREENS_STRINGS.en).every((v) => v.trim().length > 0)).toBe(true);
        expect(Object.values(ADMIN_SCREENS_STRINGS.id).every((v) => v.trim().length > 0)).toBe(true);
    });

    it("renders Collections link in AdminLayout sidebar", () => {
        mount(
            <Routes>
                <Route path="/admin" element={<AdminLayout />}>
                    <Route index element={<p>Dashboard</p>} />
                </Route>
            </Routes>,
            { route: "/admin", locale: "id" },
        );
        const navLink = screen.getByTestId("admin-nav-collections");
        expect(navLink).toHaveAttribute("href", "/admin/content/collections");
        expect(navLink).toHaveTextContent("Koleksi");
    });

    it("verifies audit hash chain from AuditLogPage for both ok and broken results", async () => {
        mocks.get.mockImplementation(async (url: string) => {
            if (url === "/admin/audit/verify") return { checked: 42, skipped: 3, ok: true, broken_at: null };
            return { items: [], total: 0 };
        });
        const view = mount(<AuditLogPage />, { locale: "en" });
        fireEvent.click(screen.getByTestId("audit-verify-button"));
        expect(await screen.findByTestId("audit-verify-result")).toHaveTextContent("42 entries checked, 3 legacy skipped");
        view.unmount();

        mocks.get.mockImplementation(async (url: string) => {
            if (url === "/admin/audit/verify") {
                return { checked: 10, skipped: 0, ok: false, broken_at: { seq: 7, reason: "hash_mismatch" } };
            }
            return { items: [], total: 0 };
        });
        mount(<AuditLogPage />, { locale: "id" });
        fireEvent.click(screen.getByTestId("audit-verify-button"));
        const banner = await screen.findByTestId("audit-verify-result");
        expect(banner).toHaveAttribute("role", "alert");
        expect(banner).toHaveTextContent("#7");
        expect(banner).toHaveTextContent("hash_mismatch");
    });

    it("supports bulk email, withdraw, anonymize, retention sweep, and QR link on RegistrarPage", async () => {
        const reg = {
            id: "reg-1",
            event_id: "ev-1",
            event_title: "Packet Tracer",
            email: "student@student.its.ac.id",
            status: "accepted",
            display_name: "Budi",
        };
        mocks.get.mockImplementation(async (url: string) => {
            if (url.startsWith("/admin/content/events")) return { items: [{ id: "ev-1", title: "Packet Tracer", capacity: 40, status: "published" }] };
            if (url.startsWith("/admin/registrations")) return { items: [reg], total: 1, counts: { accepted: 1 } };
            if (url === "/admin/privacy-jobs") return { items: [], pending: 0 };
            return { items: [] };
        });
        mocks.post.mockImplementation(async (url: string) => {
            if (url === "/admin/registrations/bulk-email") return { ok: true, queued: 1, failed: 0, skipped: 0 };
            if (url === "/admin/registrations/retention-sweep") return { ok: true, anonymized: 2 };
            return { ok: true, privacy_status: "completed" };
        });

        mount(<RegistrarPage />, { locale: "en" });
        expect(await screen.findByTestId("registration-qr-reg-1")).toHaveAttribute("href", "/api/admin/registrations/reg-1/qr");
        expect(screen.getByTestId("checkin-kpi-attended")).not.toHaveTextContent("hadir");

        // Bulk email
        fireEvent.click(screen.getByTestId("registrar-bulk-email-open"));
        fireEvent.change(screen.getByTestId("bulk-email-event"), { target: { value: "ev-1" } });
        fireEvent.change(screen.getByTestId("bulk-email-subject"), { target: { value: "Reminder" } });
        fireEvent.change(screen.getByTestId("bulk-email-body"), { target: { value: "Hello {name}" } });
        fireEvent.click(screen.getByTestId("bulk-email-submit"));
        await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/admin/registrations/bulk-email", {
            event_id: "ev-1",
            status_filter: null,
            subject: "Reminder",
            body: "Hello {name}",
        }));

        // Withdraw
        fireEvent.click(screen.getByTestId("registration-withdraw-reg-1"));
        fireEvent.click(await screen.findByTestId("registration-withdraw-reg-1-confirm"));
        await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/admin/registrations/reg-1/withdraw", {}));

        // Anonymize
        fireEvent.click(screen.getByTestId("registration-anonymize-reg-1"));
        fireEvent.click(await screen.findByTestId("registration-anonymize-reg-1-confirm"));
        await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/admin/registrations/reg-1/anonymize", {}));

        // Retention sweep
        fireEvent.click(screen.getByTestId("registrar-retention-sweep"));
        fireEvent.click(await screen.findByTestId("registrar-retention-sweep-confirm"));
        await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/admin/registrations/retention-sweep", {}));
    });

    it("loads and restores content revisions inside ContentEditor", async () => {
        const currentPost = { id: "p-1", title: "Current Title", slug: "post-1", status: "draft", body: "<p>Body</p>" };
        const restoredPost = { ...currentPost, title: "Older Title" };
        mocks.get.mockImplementation(async (url: string) => {
            if (url === "/admin/content/posts/p-1") return currentPost;
            if (url === "/admin/content/posts/p-1/revisions") {
                return { items: [{ id: "rev-1", saved_by: "editor@its.ac.id", saved_at: "2026-11-28T01:00:00Z", title: "Older Title" }] };
            }
            return { items: [] };
        });
        mocks.post.mockResolvedValue(restoredPost);

        mount(
            <Routes>
                <Route path="/admin/content/:resource/:id" element={<ContentEditor />} />
            </Routes>,
            { route: "/admin/content/posts/p-1", locale: "en" },
        );

        await screen.findByTestId("content-revisions-panel");
        fireEvent.click(screen.getByTestId("content-revisions-toggle"));
        expect(await screen.findByTestId("content-revision-rev-1")).toHaveTextContent("Older Title");
        fireEvent.click(screen.getByTestId("content-revision-restore-rev-1"));
        fireEvent.click(await screen.findByTestId("content-revision-restore-rev-1-confirm"));
        await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/admin/content/posts/p-1/revisions/rev-1/restore", {}));
        await waitFor(() => expect(screen.getByTestId("content-field-title")).toHaveValue("Older Title"));
    });

    it("shows media storage info on LabPhotosPage and Indonesian copy across admin pages", async () => {
        mocks.get.mockImplementation(async (url: string) => {
            if (url === "/admin/lab-photos") return { slots: [], illustrative_count: 0 };
            if (url === "/admin/lab-photos/storage") return { backend: "local", media_dir: "/opt/tnl/media" };
            if (url === "/admin/settings") return { site_title: "TNL", site_title_id: "TNL", short_name: "TNL", language_default: "id", contact: {}, social: {}, seo: {}, announcement: {} };
            if (url === "/admin/figma/status") return { configured: false };
            if (url === "/admin/api-keys") return { items: [], counts: { active: 0, revoked: 0 } };
            return { items: [], total: 0 };
        });

        const view1 = mount(<LabPhotosPage />, { locale: "id" });
        const storage = await screen.findByTestId("lab-photos-storage-info");
        expect(storage).toHaveTextContent("/opt/tnl/media");
        expect(storage).toHaveTextContent("Penyimpanan media");
        view1.unmount();

        const view2 = mount(<SettingsPage />, { locale: "id" });
        expect(await screen.findByTestId("settings-header")).toHaveTextContent("Pengaturan situs");
        view2.unmount();

        const view3 = mount(<ApiKeysPage />, { locale: "id" });
        expect(await screen.findByTestId("api-keys-header")).toHaveTextContent("Kunci API");
        view3.unmount();

        const view4 = mount(<ReviewQueuePage />, { locale: "id" });
        expect(await screen.findByTestId("review-queue-header")).toHaveTextContent("Perlu tinjauan");
        view4.unmount();

        const view5 = mount(<MaintainerGuidePage />, { locale: "id" });
        expect(await screen.findByTestId("guide-header")).toHaveTextContent("Panduan pengelola");
        view5.unmount();

        mount(<InboxPage />, { locale: "id" });
        expect(await screen.findByTestId("inbox-header")).toHaveTextContent("Kotak masuk");
    });
});
