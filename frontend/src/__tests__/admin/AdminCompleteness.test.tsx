import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { useState, type ReactNode } from "react";
import { KeyValueMapEditor } from "@/components/admin/repeaters/KeyValueMapEditor";
import { AccountSecurity } from "@/components/admin/AccountSecurity";
import { PasswordRecoveryForm } from "@/components/admin/PasswordRecoveryForm";
import { ReusableBlocks } from "@/components/admin/ReusableBlocks";
import { CollectionsManager } from "@/components/admin/CollectionsManager";
import PagesList from "@/pages/admin/PagesList";
import ContentEditor from "@/pages/admin/ContentEditor";
import AdminLogin from "@/pages/admin/AdminLogin";
import { ThemePage, UsersPage } from "@/pages/admin/AdminScreens";
import { RESOURCE_SPECS, toForm, toPayload } from "@/pages/admin/ContentManager";
import type { AuthUser, PageDoc } from "@/lib/types/types";
import { ADMIN_WORKFLOW_STRINGS } from "@/lib/i18n/admin-workflows-strings";
import { MailOutbox } from "@/components/admin/MailOutbox";

const mocks = vi.hoisted(() => ({
    get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), remove: vi.fn(), begin: vi.fn(),
    me: { id: "editor-1", role: "editor", totp_enabled: false } as Partial<AuthUser>,
}));
vi.mock("@/lib/api/api", async (original) => ({ ...await original<typeof import("@/lib/api/api")>(), apiGet: mocks.get, apiPost: mocks.post, apiPatch: mocks.patch, apiPut: mocks.put, apiDelete: mocks.remove }));
vi.mock("@/lib/api/hooks", () => ({ useMe: () => ({ data: mocks.me }) }));
vi.mock("@/lib/api/session", () => ({ beginSession: mocks.begin, endSession: vi.fn() }));
vi.mock("@/lib/theme/theme", () => ({ applyThemeTokens: vi.fn(), useApplyThemeTokens: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/admin/media", () => ({
    InlineMediaField: ({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) => <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />,
    MultiMediaField: ({ label, value, onChange }: { label: string; value: string[]; onChange: (value: string[]) => void }) => <button type="button" onClick={() => onChange([...(value ?? []), "/new.webp"])}>{label}: add</button>,
}));
vi.mock("@/components/admin/editor", () => ({ RichTextField: () => <div /> }));

const page: PageDoc = { id: "page-201", title: "Test page", slug: "custom-path", blocks: [{ id: "hero", type: "hero", hidden: false, props: { title: "Original", nested: { source: "kept" }, items: [1, { label: "kept" }], enabled: false, count: 0, empty: null } }], status: "draft", is_system: false, needs_review: false, issues: [], created_at: "2026-01-01", updated_at: "2026-01-01" };

function mount(ui: ReactNode, route = "/admin") {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
    return render(<QueryClientProvider client={queryClient}><MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter></QueryClientProvider>);
}
beforeEach(() => {
    vi.resetAllMocks(); localStorage.clear();
    mocks.me = { id: "editor-1", role: "editor", totp_enabled: false };
    mocks.get.mockResolvedValue({ items: [] }); mocks.post.mockResolvedValue({ ok: true }); mocks.patch.mockResolvedValue({ ok: true }); mocks.put.mockResolvedValue({ ok: true }); mocks.remove.mockResolvedValue({ ok: true });
});
afterEach(() => cleanup());

describe("audited admin data preservation", () => {
    it("keeps new workflow translations complete in English and Indonesian", () => {
        expect(Object.keys(ADMIN_WORKFLOW_STRINGS.en).sort()).toEqual(Object.keys(ADMIN_WORKFLOW_STRINGS.id).sort());
        expect(Object.values(ADMIN_WORKFLOW_STRINGS.id).every((value) => value.trim().length > 0)).toBe(true);
    });
    it("edits a scalar without stringifying nested, numeric, boolean or null properties", () => {
        const changed = vi.fn();
        function Harness() {
            const [value, setValue] = useState(page.blocks[0].props);
            return <KeyValueMapEditor value={value} onChange={(next) => { changed(next); setValue(next); }} testId="map" />;
        }
        mount(<Harness />);
        fireEvent.change(screen.getByTestId("map-val-title"), { target: { value: "Updated" } });
        expect(changed).toHaveBeenLastCalledWith({ ...page.blocks[0].props, title: "Updated" });
        expect(screen.getByTestId("map-val-enabled")).toHaveAttribute("type", "checkbox");
        fireEvent.click(screen.getByTestId("map-val-enabled"));
        expect(changed.mock.lastCall?.[0].enabled).toBe(true);
        fireEvent.change(screen.getByTestId("map-val-count"), { target: { value: "12" } });
        expect(changed.mock.lastCall?.[0].count).toBe(12);
        fireEvent.click(screen.getByTestId("map-raw-toggle"));
        const raw = screen.getByTestId("map-raw-textarea");
        expect(JSON.parse((raw as HTMLTextAreaElement).value).nested).toEqual({ source: "kept" });
        fireEvent.change(raw, { target: { value: '{"array":[],"object":{},"no":false,"zero":0,"empty":null,"text":""}' } });
        fireEvent.click(screen.getByTestId("map-raw-toggle"));
        expect(changed).toHaveBeenLastCalledWith({ array: [], object: {}, no: false, zero: 0, empty: null, text: "" });
    });

    it("uses exact detail ID beyond 200, stages PATCH, and never blanks a redacted WhatsApp field", async () => {
        const event = { id: "event-201", title: "Older event", status: "published", live_status: "published", modules: [{ title: "Original", extra: { retained: true } }] };
        mocks.get.mockImplementation(async (url: string) => url === "/admin/content/events/event-201" ? event : { items: [] });
        mocks.patch.mockResolvedValue({ ...event, title: "Updated", has_draft: true });
        mount(<Routes><Route path="/admin/content/:resource/:id" element={<ContentEditor />} /></Routes>, "/admin/content/events/event-201");
        const title = await screen.findByTestId("content-field-title");
        await waitFor(() => expect(title).toHaveValue("Older event"));
        fireEvent.change(title, { target: { value: "Updated" } });
        fireEvent.click(screen.getByTestId("content-save-button"));
        await waitFor(() => expect(mocks.patch).toHaveBeenCalled());
        const [path, payload] = mocks.patch.mock.lastCall!;
        expect(path).toBe("/admin/content/events/event-201");
        expect(payload).toMatchObject({ title: "Updated", save_as_draft: true, modules: event.modules });
        expect(payload).not.toHaveProperty("whatsapp_group_url");
        expect(mocks.get.mock.calls.some(([url]) => String(url).includes("limit=200"))).toBe(false);
        expect(toPayload(toForm(event, RESOURCE_SPECS.events), RESOURCE_SPECS.events)).not.toHaveProperty("whatsapp_group_url");
    });

    it("keeps an authorized WhatsApp value on a title-only update and hides the field for viewers", async () => {
        const event = { id: "event-1", title: "Event", status: "draft", whatsapp_group_url: "https://chat.whatsapp.com/official" };
        mocks.get.mockResolvedValue(event); mocks.patch.mockResolvedValue(event);
        const view = mount(<Routes><Route path="/admin/content/:resource/:id" element={<ContentEditor />} /></Routes>, "/admin/content/events/event-1");
        await waitFor(() => expect(screen.getByTestId("content-field-title")).toHaveValue("Event"));
        fireEvent.change(screen.getByTestId("content-field-title"), { target: { value: "Updated" } });
        fireEvent.click(screen.getByTestId("content-save-button"));
        await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith("/admin/content/events/event-1", expect.objectContaining({ whatsapp_group_url: event.whatsapp_group_url })));
        view.unmount(); mocks.me = { id: "viewer", role: "viewer" };
        mount(<Routes><Route path="/admin/content/:resource/:id" element={<ContentEditor />} /></Routes>, "/admin/content/events/event-1");
        await screen.findByTestId("content-editor-events");
        expect(screen.queryByTestId("content-field-whatsapp_group_url")).not.toBeInTheDocument();
    });

    it("preserves block JSON types, rejects a nonobject root and links the protected exact-ID preview", async () => {
        mocks.get.mockImplementation(async (url: string) => url === "/admin/pages" ? { items: [page] } : page);
        mocks.patch.mockResolvedValue(page);
        mount(<PagesList />);
        fireEvent.click(await screen.findByTestId("page-card-custom-path"));
        expect(await screen.findByTestId("page-preview-link")).toHaveAttribute("href", "/p/custom-path?preview=page-201");
        fireEvent.click(screen.getByTestId("block-edit-hero"));
        fireEvent.change(screen.getByTestId("block-props-hero-val-title"), { target: { value: "Changed" } });
        fireEvent.click(screen.getByTestId("block-props-save-hero"));
        await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith("/admin/pages/page-201/blocks/hero", { props: { ...page.blocks[0].props, title: "Changed" } }));
        fireEvent.change(screen.getByLabelText("Widget properties JSON"), { target: { value: "[]" } });
        expect(screen.getByTestId("block-props-save-hero")).toBeDisabled();
    });

    it("preserves gallery alt/caption/extension metadata when adding an image", async () => {
        const images = [{ url: "/first.webp", alt: "Kept alt", caption: "Kept caption", extension: { credit: "Author" } }];
        const fixture = { ...page, blocks: [{ id: "gallery", type: "gallery", hidden: false, props: { images } }] };
        mocks.get.mockImplementation(async (url: string) => url === "/admin/pages" ? { items: [fixture] } : fixture);
        mocks.patch.mockResolvedValue(fixture);
        mount(<PagesList />); fireEvent.click(await screen.findByTestId("page-card-custom-path"));
        fireEvent.click(await screen.findByTestId("block-edit-gallery"));
        fireEvent.click(screen.getByText("Gallery Images: add"));
        fireEvent.click(screen.getByTestId("block-props-save-gallery"));
        await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith("/admin/pages/page-201/blocks/gallery", { props: { images: [...images, { url: "/new.webp", alt: "" }] } }));
    });

    it("disables block saving for invalid nested JSON without replacing its stored value", async () => {
        mocks.get.mockImplementation(async (url: string) => url === "/admin/pages" ? { items: [page] } : page);
        mount(<PagesList />); fireEvent.click(await screen.findByTestId("page-card-custom-path"));
        fireEvent.click(await screen.findByTestId("block-edit-hero"));
        fireEvent.change(screen.getByTestId("block-props-hero-val-nested"), { target: { value: "{bad" } });
        expect(screen.getByTestId("block-props-save-hero")).toBeDisabled();
        expect(JSON.parse((screen.getByLabelText("Widget properties JSON") as HTMLTextAreaElement).value).nested).toEqual({ source: "kept" });
        fireEvent.change(screen.getByTestId("block-props-hero-val-nested"), { target: { value: '{"source":"updated"}' } });
        expect(screen.getByTestId("block-props-save-hero")).toBeEnabled();
    });

    it("updates bilingual page metadata and supports confirmed non-system deletion", async () => {
        const fixture = { ...page, meta_description: "Original description", meta_description_id: "Deskripsi asli" };
        mocks.get.mockImplementation(async (url: string) => url === "/admin/pages" ? { items: [fixture] } : fixture); mocks.patch.mockResolvedValue(fixture);
        mount(<PagesList />); fireEvent.click(await screen.findByTestId("page-card-custom-path"));
        await screen.findByTestId("page-builder-custom-path");
        fireEvent.click(screen.getByText("Page details"));
        fireEvent.change(screen.getByLabelText("Search description (English)"), { target: { value: "Updated description" } });
        fireEvent.submit(screen.getByRole("form", { name: "Page details" }));
        await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith("/admin/pages/page-201", { title: page.title, title_id: "", meta_description: "Updated description", meta_description_id: "Deskripsi asli" }));
        fireEvent.click(screen.getByTestId("page-delete")); fireEvent.click(await screen.findByTestId("page-delete-confirm"));
        await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("/admin/pages/page-201"));
    });
});

describe("account and invitation workflows", () => {
    it("enrolls and confirms TOTP for the current user, showing recovery codes only in memory", async () => {
        const stored = vi.spyOn(Storage.prototype, "setItem");
        mocks.post.mockImplementation(async (url: string) => url.endsWith("totp-setup") ? { secret: "TESTSECRET", otpauth_uri: "otpauth://totp/TNL:test?secret=TESTSECRET", expires_at: "2026-11-28T00:00:00Z" } : { ok: true, totp_enabled: true, recovery_codes: ["recovery-one", "recovery-two"] });
        mount(<AccountSecurity />);
        fireEvent.submit(screen.getByRole("form", { name: "My account & security" }));
        expect(await screen.findByLabelText("Authenticator setup secret")).toHaveValue("TESTSECRET");
        expect(mocks.post).toHaveBeenCalledWith("/admin/users/editor-1/totp-setup", {});
        fireEvent.change(screen.getByLabelText("Authenticator or recovery code"), { target: { value: "123456" } });
        fireEvent.submit(screen.getByRole("form", { name: "My account & security" }));
        await screen.findByText("recovery-one");
        expect(mocks.post).toHaveBeenCalledWith("/admin/users/editor-1/totp-confirm", { code: "123456" });
        expect(screen.queryByLabelText("Authenticator setup secret")).not.toBeInTheDocument();
        expect(stored).not.toHaveBeenCalled();
        fireEvent.click(screen.getByText("I have stored my recovery codes"));
        expect(screen.queryByText("recovery-one")).not.toBeInTheDocument(); stored.mockRestore();
    });

    it("regenerates recovery codes and disables TOTP with password plus second-factor proof", async () => {
        mocks.me = { id: "self", role: "viewer", totp_enabled: true };
        mocks.post.mockResolvedValue({ ok: true, recovery_codes: ["replacement"] });
        mount(<AccountSecurity />);
        const form = screen.getByRole("form", { name: "My account & security" });
        fireEvent.change(within(form).getByLabelText("Current password"), { target: { value: "correct-password" } });
        fireEvent.change(within(form).getByLabelText("Authenticator or recovery code"), { target: { value: "old-recovery" } });
        fireEvent.submit(form);
        await screen.findByText("replacement");
        expect(mocks.post).toHaveBeenCalledWith("/admin/users/self/totp-recovery-codes", { password: "correct-password", code: "old-recovery" });
        fireEvent.change(within(form).getByLabelText("Current password"), { target: { value: "correct-password" } });
        fireEvent.change(within(form).getByLabelText("Authenticator or recovery code"), { target: { value: "replacement" } });
        fireEvent.click(screen.getByTestId("security-disable"));
        fireEvent.click(await screen.findByTestId("security-disable-confirm"));
        await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/admin/users/self/totp-disable", { password: "correct-password", code: "replacement" }));
    });

    it("requests reset generically, validates confirmation, and never automatically signs in", async () => {
        const view = mount(<PasswordRecoveryForm />);
        fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "member@example.com" } });
        fireEvent.submit(screen.getByRole("form"));
        await screen.findByText("If this account can reset its password, a reset link will be sent.");
        expect(mocks.post).toHaveBeenCalledWith("/auth/password-reset/request", { email: "member@example.com" });
        view.unmount(); mount(<PasswordRecoveryForm token="one-time-token" />);
        fireEvent.change(screen.getByLabelText("New password"), { target: { value: "new-password-123" } });
        fireEvent.change(screen.getByLabelText("Repeat password"), { target: { value: "different-password" } });
        fireEvent.submit(screen.getByRole("form")); expect(screen.getByRole("alert")).toHaveTextContent("The two passwords do not match.");
        expect(mocks.post).toHaveBeenCalledTimes(1);
        fireEvent.change(screen.getByLabelText("Repeat password"), { target: { value: "new-password-123" } });
        fireEvent.submit(screen.getByRole("form"));
        await screen.findByText("Password reset. Sign in with your new password.");
        expect(mocks.post).toHaveBeenLastCalledWith("/auth/password-reset/confirm", { token: "one-time-token", password: "new-password-123" });
        expect(mocks.begin).not.toHaveBeenCalled();
    });

    it("completes a Google second-factor challenge using a recovery code without asking for password", async () => {
        mocks.get.mockResolvedValue({ enabled: true, auth_base: "/api/auth/google/start" });
        mount(<Routes><Route path="/admin/login" element={<AdminLogin />} /><Route path="/admin" element={<p>Signed in destination</p>} /></Routes>, "/admin/login?google=two-factor");
        expect(screen.queryByTestId("login-email-input")).not.toBeInTheDocument();
        fireEvent.click(screen.getByText("Use a recovery code"));
        expect(screen.getByTestId("login-totp-input")).toHaveAttribute("inputmode", "text");
        fireEvent.change(screen.getByTestId("login-totp-input"), { target: { value: "recovery-code" } });
        fireEvent.submit(screen.getByTestId("admin-login-form"));
        await screen.findByText("Signed in destination");
        expect(mocks.post).toHaveBeenCalledWith("/auth/google/complete", { code: "recovery-code" });
        expect(mocks.begin).toHaveBeenCalledTimes(1);
    });

    it("sends selected divisions on invitation and explicit edits, and rotates/revokes pending invitations", async () => {
        const user = { id: "pending", name: "Pending member", email: "pending@example.com", role: "contributor", active: true, divisions: ["Academic"], invite_pending: true };
        mocks.get.mockResolvedValue({ items: [user] });
        mount(<UsersPage />);
        fireEvent.change(screen.getByTestId("invite-name-input"), { target: { value: "New member" } });
        fireEvent.change(screen.getByTestId("invite-email-input"), { target: { value: "new@example.com" } });
        const inviteDivision = screen.getByRole("group", { name: "Divisions" });
        fireEvent.click(within(inviteDivision).getByLabelText("Research"));
        fireEvent.click(screen.getByTestId("invite-submit"));
        await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/admin/users", { name: "New member", email: "new@example.com", role: "contributor", divisions: ["Research"] }));
        const row = await screen.findByTestId("user-row-pending");
        fireEvent.click(within(row).getByLabelText("External"));
        fireEvent.click(within(row).getByText("Save divisions")); fireEvent.click(await screen.findByTestId("confirm-accept"));
        await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith("/admin/users/pending", { divisions: ["Academic", "External"] }));
        fireEvent.click(within(row).getByText("Rotate & resend invitation"));
        await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/admin/users/pending/invite", {}));
        fireEvent.click(screen.getByTestId("invite-revoke-pending")); fireEvent.click(await screen.findByTestId("invite-revoke-pending-confirm"));
        await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("/admin/users/pending/invite"));
    });
});

describe("theme and CMS libraries", () => {
    it("checks the current local theme after a pause and stops presenting saved checks as current", async () => {
        const tokens = { primary_color: "#223027", color_body: "#111111", color_surface: "#ffffff" };
        mocks.get.mockResolvedValue({ draft: tokens, published: tokens, contrast: [{ label: "Saved contrast", ratio: 12, passes: true }] });
        mocks.post.mockResolvedValue({ contrast: [{ label: "Current contrast", ratio: 1, passes: false, required: 4.5 }] });
        mount(<ThemePage />);
        await screen.findByText("Saved contrast");
        fireEvent.change(screen.getByTestId("theme-gsm-primary_color"), { target: { value: "#ffffff" } });
        expect(screen.queryByText("Saved contrast")).not.toBeInTheDocument();
        await screen.findByText("Current contrast");
        expect(mocks.post).toHaveBeenCalledWith("/admin/theme/contrast", { ...tokens, primary_color: "#ffffff" });
        expect(mocks.put).not.toHaveBeenCalled();
        expect(screen.getByTestId("theme-contrast-fail")).toHaveTextContent("1");
    });

    it("keeps edits typed while an older publish request is in flight", async () => {
        const tokens = { primary_color: "#223027", color_body: "#111111", color_surface: "#ffffff" };
        mocks.get.mockResolvedValue({ draft: tokens, published: tokens, contrast: [] });
        let complete!: (value: unknown) => void;
        mocks.post.mockImplementation((url: string) => url === "/admin/theme/publish" ? new Promise((resolve) => { complete = resolve; }) : Promise.resolve({ contrast: [] }));
        mount(<ThemePage />);
        const input = await screen.findByTestId("theme-gsm-primary_color");
        fireEvent.change(input, { target: { value: "#123456" } });
        fireEvent.click(screen.getByTestId("theme-publish-button"));
        await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/admin/theme/publish", { ...tokens, primary_color: "#123456" }));
        fireEvent.change(input, { target: { value: "#654321" } });
        complete({ published: { ...tokens, primary_color: "#123456" } });
        await waitFor(() => expect(screen.getByTestId("theme-publish-button")).toBeEnabled());
        expect(input).toHaveValue("#654321");
    });

    it("publishes the current theme tokens atomically instead of publishing an older saved draft", async () => {
        const tokens = { primary_color: "#223027", color_body: "#111111", color_surface: "#ffffff" };
        mocks.get.mockResolvedValue({ draft: tokens, published: tokens, contrast: [] });
        mocks.post.mockResolvedValue({ published: tokens });
        mount(<ThemePage />);
        fireEvent.change(await screen.findByTestId("theme-gsm-primary_color"), { target: { value: "#123456" } });
        expect(screen.getByTestId("theme-contrast-scope")).toHaveTextContent("Checking the current draft colours");
        fireEvent.click(screen.getByTestId("theme-publish-button"));
        await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/admin/theme/publish", { ...tokens, primary_color: "#123456" }));
    });

    it("saves and applies a reusable block without changing nested properties", async () => {
        const saved = { id: "saved", name: "Saved hero", block: page.blocks[0] };
        mocks.get.mockResolvedValue({ items: [saved] }); mocks.post.mockResolvedValue(page);
        const applied = vi.fn();
        mount(<ReusableBlocks pageId={page.id} blocks={page.blocks} onApplied={applied} />);
        fireEvent.click(screen.getByText("Reusable blocks"));
        fireEvent.change(screen.getByLabelText("Reusable block name"), { target: { value: "Hero copy" } });
        fireEvent.change(screen.getByLabelText("Choose a widget"), { target: { value: "hero" } });
        fireEvent.submit(screen.getByRole("form", { name: "Save to block library" }));
        await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/admin/saved-blocks", { name: "Hero copy", block: { type: "hero", props: page.blocks[0].props, hidden: false } }));
        fireEvent.click(await screen.findByText("Insert block"));
        await waitFor(() => expect(mocks.post).toHaveBeenCalledWith(`/admin/pages/${page.id}/saved-blocks/saved`, {}));
        expect(applied).toHaveBeenCalledWith(page);
    });

    it("edits collection item typed fields while preserving unknown stored values", async () => {
        mocks.me = { id: "admin", role: "super_admin" };
        const definition = { id: "c1", key: "catalog", name: "Catalog", template: "cards", fields: [{ key: "name", label: "Item name", type: "text" }, { key: "quantity", label: "Quantity", type: "number" }] };
        const item = { id: "i1", status: "published", values: { name: "Radio", quantity: 2, extension: { credits: ["kept"] } } };
        mocks.get.mockImplementation(async (url: string) => ({ items: url.includes("/items?") ? [item] : [definition] }));
        mount(<CollectionsManager />);
        await screen.findByRole("option", { name: "Catalog" });
        fireEvent.change(screen.getByLabelText("Choose a collection"), { target: { value: "catalog" } });
        const row = (await screen.findByText("Radio · published")).closest("li")!;
        fireEvent.click(within(row).getByText("Edit"));
        fireEvent.change(screen.getByTestId("collection-value-quantity"), { target: { value: "3" } });
        fireEvent.submit(screen.getByRole("form", { name: "Item data (JSON object)" }));
        await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith("/admin/collections/catalog/items/i1", { values: { ...item.values, quantity: 3 }, save_as_draft: true }));
    });

    it("creates, updates and deletes collection definitions using the declared schema contract", async () => {
        mocks.me = { id: "admin", role: "super_admin" };
        const definition = { id: "c-new", key: "resources", name: "Resources", fields: [{ key: "title", label: "Title", type: "text", required: true }], template: "cards" };
        let definitions: unknown[] = [];
        mocks.get.mockImplementation(async (url: string) => ({ items: url.includes("/items?") ? [] : definitions, total: 0 }));
        mocks.post.mockImplementation(async () => { definitions = [definition]; return definition; });
        mocks.patch.mockResolvedValue({ ...definition, name: "Updated resources" });
        mount(<CollectionsManager />);
        fireEvent.change(screen.getByLabelText("Collection name"), { target: { value: "Resources" } });
        fireEvent.change(screen.getByLabelText("Collection key"), { target: { value: "resources" } });
        fireEvent.change(screen.getByLabelText("Fields (JSON array)"), { target: { value: JSON.stringify(definition.fields) } });
        fireEvent.submit(screen.getByRole("form", { name: "Custom collections" }));
        await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/admin/collections", { name: "Resources", key: "resources", fields: definition.fields, template: "cards" }));
        await screen.findByText("Collection items: Resources");
        fireEvent.change(screen.getByLabelText("Collection name"), { target: { value: "Updated resources" } });
        fireEvent.submit(screen.getByRole("form", { name: "Custom collections" }));
        await waitFor(() => expect(mocks.patch).toHaveBeenCalledWith("/admin/collections/c-new", { name: "Updated resources", fields: definition.fields, template: "cards" }));
        fireEvent.click(screen.getByTestId("collection-delete")); fireEvent.click(await screen.findByTestId("collection-delete-confirm"));
        await waitFor(() => expect(mocks.remove).toHaveBeenCalledWith("/admin/collections/c-new"));
    });

    it("paginates collection items beyond the first server page", async () => {
        const definition = { id: "c", key: "catalog", name: "Catalog", fields: [] };
        mocks.get.mockImplementation(async (url: string) => url.includes("/items?") ? { items: [{ id: url.includes("offset=50") ? "older" : "first", values: {}, status: "draft" }], total: 51 } : { items: [definition] });
        mount(<CollectionsManager />);
        await screen.findByRole("option", { name: "Catalog" });
        fireEvent.change(screen.getByLabelText("Choose a collection"), { target: { value: "catalog" } });
        await screen.findByText("first · draft"); fireEvent.click(screen.getByText("Next"));
        await screen.findByText("older · draft");
        expect(mocks.get).toHaveBeenCalledWith("/admin/collections/catalog/items?limit=50&offset=50");
    });

    it("shows failed delivery status and retries without reporting it as delivered", async () => {
        mocks.get.mockResolvedValue({ smtp_configured: false, items: [{ id: "delivery", to: "recipient@example.com", subject: "Pending reply", status: "failed", attempts: 2 }] });
        mount(<MailOutbox />); fireEvent.click(screen.getByText("Email delivery"));
        await screen.findByText("Pending reply"); expect(screen.getByText(/SMTP is not configured/)).toBeInTheDocument();
        expect(screen.getByText("failed · 2")).toBeInTheDocument();
        fireEvent.click(screen.getByText("Retry delivery"));
        await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/admin/outbox/delivery/retry", {}));
        expect(screen.queryByText("delivered")).not.toBeInTheDocument();
    });
});
