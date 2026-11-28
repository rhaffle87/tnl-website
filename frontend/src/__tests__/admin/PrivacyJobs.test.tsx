import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { focusManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PrivacyJobs } from "@/components/admin/PrivacyJobs";
import { AdminLocaleProvider } from "@/lib/i18n/admin-i18n";
import { LocaleContext, STRINGS } from "@/lib/i18n/i18n";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), me: { id: "operator", role: "registrar" } as { id: string; role: string } | undefined }));
vi.mock("@/lib/api/api", async (original) => ({ ...await original<typeof import("@/lib/api/api")>(), apiGet: mocks.get, apiPost: mocks.post }));
vi.mock("@/lib/api/hooks", () => ({ useMe: () => ({ data: mocks.me }) }));

const job = { id: "cleanup-1", delete: true, status: "pending", attempts: 3, error_code: "file_delete_failed", created_at: "2026-11-20T08:00:00Z", next_attempt_at: "2026-11-28T08:30:00Z" };
const clients: QueryClient[] = [];
function mount(locale: "en" | "id" = "en") {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 }, mutations: { retry: false } } });
    clients.push(client);
    return render(<QueryClientProvider client={client}><LocaleContext.Provider value={{ locale, setLocale: vi.fn(), t: (key) => STRINGS[locale][key] }}><AdminLocaleProvider><PrivacyJobs /></AdminLocaleProvider></LocaleContext.Provider></QueryClientProvider>);
}
beforeEach(() => {
    vi.resetAllMocks();
    mocks.me = { id: "operator", role: "registrar" };
    mocks.get.mockResolvedValue({ items: [job], pending: 1 });
    mocks.post.mockResolvedValue({ ok: true, privacy_status: "pending" });
});
afterEach(() => {
    cleanup(); clients.splice(0).forEach((client) => client.clear());
    focusManager.setFocused(undefined); vi.useRealTimers();
});

describe("operator privacy cleanup", () => {
    it("fetches only after opening and never retries cleanup automatically", async () => {
        mount();
        expect(mocks.get).not.toHaveBeenCalled();
        const toggle = screen.getByRole("button", { name: "Privacy cleanup" });
        expect(toggle).toHaveAttribute("aria-expanded", "false");
        fireEvent.click(toggle);
        expect(await screen.findByText("Cleanup job cleanup-1")).toBeInTheDocument();
        expect(mocks.get).toHaveBeenCalledExactlyOnceWith("/admin/privacy-jobs");
        expect(mocks.post).not.toHaveBeenCalled();
        fireEvent.click(toggle);
        expect(screen.queryByText("Cleanup job cleanup-1")).not.toBeInTheDocument();
        expect(toggle).toHaveAttribute("aria-expanded", "false");
    });

    it("refreshes every 30 seconds only while the list is open", async () => {
        vi.useFakeTimers(); focusManager.setFocused(true);
        mount();
        await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
        expect(mocks.get).not.toHaveBeenCalled();
        await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Privacy cleanup" })); await vi.advanceTimersByTimeAsync(1); });
        expect(mocks.get).toHaveBeenCalledTimes(1);
        await act(async () => { await vi.advanceTimersByTimeAsync(30_000); });
        expect(mocks.get).toHaveBeenCalledTimes(2);
        fireEvent.click(screen.getByRole("button", { name: "Privacy cleanup" }));
        await act(async () => { await vi.advanceTimersByTimeAsync(60_000); });
        expect(mocks.get).toHaveBeenCalledTimes(2);
        expect(mocks.post).not.toHaveBeenCalled();
    });

    it.each(["editor", "contributor", "viewer", "admin", "unknown"])("denies the panel and network work for role %s without manage permission", (role) => {
        mocks.me = { id: "read-only", role };
        const { container } = mount();
        expect(container).toBeEmptyDOMElement();
        expect(mocks.get).not.toHaveBeenCalled(); expect(mocks.post).not.toHaveBeenCalled();
    });

    it("waits for the authenticated principal before making requests", () => {
        mocks.me = undefined;
        const { container } = mount();
        expect(container).toBeEmptyDOMElement(); expect(mocks.get).not.toHaveBeenCalled();
    });

    it("allows Super Admin, guards duplicate retries, and reports pending rather than completed", async () => {
        mocks.me = { id: "super", role: "super_admin" };
        let complete!: (response: unknown) => void;
        mocks.post.mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
        mount(); fireEvent.click(screen.getByRole("button", { name: "Privacy cleanup" }));
        const retry = await screen.findByRole("button", { name: "Retry cleanup" });
        fireEvent.click(retry); fireEvent.click(retry);
        await waitFor(() => expect(mocks.post).toHaveBeenCalledExactlyOnceWith("/admin/privacy-jobs/cleanup-1/retry", {}));
        expect(screen.getByRole("button", { name: "Retrying cleanup..." })).toBeDisabled();
        await act(async () => { complete({ ok: true, privacy_status: "pending" }); });
        expect(await screen.findByText(/Privacy cleanup is still pending/)).toBeInTheDocument();
        expect(screen.queryByText("Privacy cleanup completed.")).not.toBeInTheDocument();
        expect(screen.getByRole("button", { name: "Retry cleanup" })).toBeEnabled();
        expect(mocks.get).toHaveBeenCalledTimes(2);
    });

    it("keeps completion feedback visible after refetch removes the finished job", async () => {
        mocks.get.mockResolvedValueOnce({ items: [job], pending: 1 }).mockResolvedValue({ items: [], pending: 0 });
        mocks.post.mockResolvedValue({ ok: true, privacy_status: "completed" });
        mount(); fireEvent.click(screen.getByRole("button", { name: "Privacy cleanup" }));
        fireEvent.click(await screen.findByRole("button", { name: "Retry cleanup" }));
        expect(await screen.findByText("Privacy cleanup completed.")).toBeInTheDocument();
        expect(await screen.findByText("No pending privacy cleanup jobs.")).toBeInTheDocument();
        expect(screen.getByText("Pending cleanup jobs: 0")).toBeInTheDocument();
    });

    it("shows loading, a safe fetch error and an explicit read-only retry", async () => {
        let fail!: (reason: Error) => void;
        mocks.get.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; })).mockResolvedValue({ items: [], pending: 0 });
        mount(); fireEvent.click(screen.getByRole("button", { name: "Privacy cleanup" }));
        expect(screen.getByRole("status")).toHaveTextContent("Loading");
        await act(async () => { fail(new Error("private-person@example.test /secret/private-upload.pdf")); });
        expect(await screen.findByRole("alert")).toHaveTextContent("Could not load privacy cleanup jobs.");
        expect(document.body).not.toHaveTextContent("private-person");
        fireEvent.click(screen.getByRole("button", { name: /retry/i }));
        await screen.findByText("No pending privacy cleanup jobs.");
        expect(mocks.get).toHaveBeenCalledTimes(2); expect(mocks.post).not.toHaveBeenCalled();
    });

    it("keeps failed manual work actionable without exposing error details", async () => {
        mocks.post.mockRejectedValue(new Error("operator@example.test private/path.pdf"));
        mount(); fireEvent.click(screen.getByRole("button", { name: "Privacy cleanup" }));
        fireEvent.click(await screen.findByRole("button", { name: "Retry cleanup" }));
        expect(await screen.findByRole("alert")).toHaveTextContent("Could not retry cleanup. The job remains pending; try again later.");
        expect(screen.getByRole("button", { name: "Retry cleanup" })).toBeEnabled();
        expect(document.body).not.toHaveTextContent("operator@example.test"); expect(document.body).not.toHaveTextContent("private/path.pdf");
        expect(screen.queryByText("Privacy cleanup completed.")).not.toBeInTheDocument();
    });

    it("localizes safe metadata and dates without rendering extra PII or file keys", async () => {
        mocks.get.mockResolvedValue({ items: [{ ...job, delete: false, email: "hidden@example.test", full_name: "Hidden Person", file_keys: ["private-upload.pdf"] }], pending: 1 });
        mount("id"); fireEvent.click(screen.getByRole("button", { name: "Pembersihan data pribadi" }));
        await screen.findByText("Pekerjaan pembersihan cleanup-1");
        expect(screen.getByText("Anonimisasi · Tertunda · Percobaan: 3")).toBeInTheDocument();
        expect(screen.getByText(new Date(job.created_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }))).toHaveAttribute("datetime", job.created_at);
        expect(screen.getByText(new Date(job.next_attempt_at).toLocaleString("id-ID", { dateStyle: "medium", timeStyle: "short" }))).toHaveAttribute("datetime", job.next_attempt_at);
        expect(document.body).not.toHaveTextContent("hidden@example.test"); expect(document.body).not.toHaveTextContent("Hidden Person"); expect(document.body).not.toHaveTextContent("private-upload.pdf");
        expect(mocks.post).not.toHaveBeenCalled();
    });
});
