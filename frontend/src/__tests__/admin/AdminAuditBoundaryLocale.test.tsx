import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { AuditLogPage } from "@/pages/admin/AdminDashboard";
import { AdminErrorBanner, AdminLoadMore, AdminStatusBadge, ConfirmButton, IssueList } from "@/pages/admin/AdminUI";
import { ADMIN_STRINGS, AdminLocaleProvider } from "@/lib/i18n/admin-i18n";
import { LocaleContext, STRINGS } from "@/lib/i18n/i18n";
import { apiGet } from "@/lib/api/api";

vi.mock("@/lib/api/api", async () => ({
  ...await vi.importActual<typeof import("@/lib/api/api")>("@/lib/api/api"),
  apiGet: vi.fn(),
}));

function mount(ui: ReactNode, locale?: "en" | "id") {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const inner = locale ? (
    <LocaleContext.Provider value={{ locale, setLocale: vi.fn(), t: (key) => STRINGS[locale][key] }}>
      <AdminLocaleProvider>{ui}</AdminLocaleProvider>
    </LocaleContext.Provider>
  ) : ui;
  return render(<QueryClientProvider client={client}><MemoryRouter>{inner}</MemoryRouter></QueryClientProvider>);
}

beforeEach(() => {
  vi.mocked(apiGet).mockReset();
  vi.mocked(apiGet).mockImplementation(async (url: string) => {
    const limit = Number(new URL(url, "https://example.test").searchParams.get("limit"));
    return {
      total: 550,
      items: Array.from({ length: limit }, (_, index) => ({
        id: `audit-${index}`, actor_email: "editor@example.test", action: "publish",
        resource: "posts", created_at: "2026-11-27T00:00:00Z",
      })),
    } as Awaited<ReturnType<typeof apiGet>>;
  });
});

describe("audit export boundary and bilingual UI", () => {
  it("keeps the true total, caps the visible range, and never offers a dead load-more action", async () => {
    mount(<AuditLogPage />);
    await waitFor(() => expect(screen.getByTestId("audit-count")).toHaveTextContent("50 of 550 events"));
    expect(screen.getByTestId("audit-export-button")).toHaveAttribute("href", "/api/admin/audit/export?limit=50");
    expect(screen.getByTestId("audit-export-truncated")).toHaveTextContent("Only 50 rows");
    for (const count of [100, 150, 200]) {
      fireEvent.click(screen.getByRole("button", { name: "Load more" }));
      await waitFor(() => expect(screen.getByTestId("audit-count")).toHaveTextContent(`${count} of 550 events`));
    }
    expect(screen.getByTestId("audit-export-button")).toHaveAttribute("href", "/api/admin/audit/export?limit=200");
    expect(screen.queryByRole("button", { name: "Load more" })).not.toBeInTheDocument();
    expect(screen.getByTestId("audit-export-truncated")).toHaveTextContent("200-row display limit");
    expect(screen.getByTestId("audit-export-truncated")).toHaveTextContent("Narrow the time range");
  });

  it("resets range growth when the period changes and keeps the export query aligned", async () => {
    mount(<AuditLogPage />);
    await screen.findByTestId("audit-table");
    fireEvent.click(screen.getByRole("button", { name: "Load more" }));
    await waitFor(() => expect(screen.getByTestId("audit-count")).toHaveTextContent("100 of 550"));
    fireEvent.change(screen.getByLabelText("Time range"), { target: { value: "week" } });
    await waitFor(() => expect(apiGet).toHaveBeenLastCalledWith("/admin/audit?limit=50&period=week"));
    await waitFor(() => expect(screen.getByTestId("audit-export-button")).toHaveAttribute("href", "/api/admin/audit/export?period=week&limit=50"));
  });

  it.each(["en", "id"] as const)("renders localized headers and range labels in %s", async (locale) => {
    mount(<AuditLogPage />, locale);
    await screen.findByTestId("audit-table");
    expect(screen.getByLabelText(locale === "id" ? "Rentang waktu" : "Time range")).toBeInTheDocument();
    expect(screen.getByRole("option", { name: locale === "id" ? "7 hari terakhir" : "Last 7 days" })).toHaveValue("week");
    expect(screen.getByRole("columnheader", { name: locale === "id" ? "Waktu" : "When" })).toBeInTheDocument();
    expect(screen.getByTestId("audit-export-button")).toHaveTextContent(locale === "id" ? "Ekspor ke spreadsheet" : "Export to spreadsheet");
  });

  it("does not offer a download of unseen records while loading or after an error", async () => {
    let reject!: (reason: Error) => void;
    vi.mocked(apiGet).mockImplementation(() => new Promise((_resolve, rejectPromise) => { reject = rejectPromise; }));
    mount(<AuditLogPage />);
    expect(screen.getByTestId("audit-export-button")).not.toHaveAttribute("href");
    expect(screen.getByTestId("audit-export-button")).toHaveAttribute("aria-disabled", "true");
    reject(new Error("offline"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the activity log.");
    expect(screen.getByTestId("audit-export-button")).not.toHaveAttribute("href");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("does not warn of truncation for a complete or empty result", async () => {
    vi.mocked(apiGet).mockResolvedValue({ items: [], total: 0 });
    mount(<AuditLogPage />, "id");
    expect(await screen.findByText("Belum ada aktivitas yang tercatat.")).toBeInTheDocument();
    expect(screen.getByTestId("audit-count")).toHaveTextContent("0 dari 0 peristiwa");
    expect(screen.queryByTestId("audit-export-truncated")).not.toBeInTheDocument();
  });
});

describe("shared admin UI locale contract", () => {
  it.each(["en", "id"] as const)("localizes retry, count, confirmation, issue and status copy in %s", async (locale) => {
    mount(<>
      <AdminLoadMore shown={1} total={2} onMore={vi.fn()} />
      <AdminErrorBanner message="Backend-authored diagnostic" onRetry={vi.fn()} />
      <AdminStatusBadge variant="published" />
      <IssueList issues={[{ code: "custom", field: "body", severity: "warning", message: "Authored warning" }]} />
      <ConfirmButton label="Run" confirmLabel="Accept" question="Proceed?" onConfirm={() => new Promise(() => {})} testId="test-confirm" />
    </>, locale);
    expect(screen.getByText(locale === "id" ? "1 dari 2" : "1 of 2")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: locale === "id" ? "Muat lebih banyak" : "Load more" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: locale === "id" ? "Coba lagi" : "Retry" })).toBeInTheDocument();
    expect(screen.getByText(locale === "id" ? "Diterbitkan" : "Published")).toBeInTheDocument();
    expect(screen.getByTestId("quality-issue-custom")).toHaveTextContent(locale === "id" ? "Perlu diperiksa" : "Worth checking");
    expect(screen.getByText("Authored warning")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("test-confirm"));
    expect(await screen.findByRole("dialog")).toHaveAccessibleName("Proceed?");
    expect(screen.getByRole("button", { name: locale === "id" ? "Batal" : "Cancel" })).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("test-confirm-confirm"));
    expect(screen.getByTestId("test-confirm-confirm")).toHaveTextContent(locale === "id" ? "Memproses..." : "Working...");
  });

  it("keeps every admin dictionary key paired and populated", () => {
    expect(Object.keys(ADMIN_STRINGS.en).sort()).toEqual(Object.keys(ADMIN_STRINGS.id).sort());
    for (const locale of ["en", "id"] as const) {
      for (const value of Object.values(ADMIN_STRINGS[locale])) expect(value.trim()).not.toBe("");
    }
  });
});
