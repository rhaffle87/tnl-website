import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { ApiKeysPage } from "@/pages/admin/AdminScreens";
import { AuditLogPage } from "@/pages/admin/AdminDashboard";
import { renderWithProviders } from "./test-utils";
import * as api from "@/lib/api/api";

vi.mock("@/lib/api/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/api")>("@/lib/api/api");
  return {
    ...actual,
    apiGet: vi.fn().mockImplementation((url: string) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({ id: "u-admin", name: "Super Admin", email: "admin@its.ac.id", role: "super_admin" });
      }
      if (url.includes("/admin/api-keys")) {
        return Promise.resolve({
          items: [
            { id: "k-live", name: "Live reader", prefix: "tnl_live_", scopes: ["read"], calls: 12, active: true },
            { id: "k-old", name: "Leaked reader", prefix: "tnl_leak_", scopes: ["read"], calls: 3, active: false },
          ],
          counts: { active: 1, revoked: 1 },
        });
      }
      if (url.includes("/admin/audit")) {
        return Promise.resolve({
          items: [
            { id: "a1", actor_email: "admin@its.ac.id", action: "publish", resource: "content", created_at: new Date().toISOString() },
          ],
          total: 1,
        });
      }
      return Promise.resolve({});
    }),
    apiDelete: vi.fn().mockResolvedValue({ ok: true }),
  };
});

describe("admin key lifecycle UI", () => {
  beforeEach(() => {
    vi.mocked(api.apiGet).mockClear();
    vi.mocked(api.apiDelete).mockClear();
  });

  it("labels active and revoked keys and only offers purge for revoked keys", async () => {
    renderWithProviders(<ApiKeysPage />, { route: "/admin/api-keys" });

    expect(await screen.findByTestId("api-key-status-k-live")).toHaveTextContent("active");
    expect(screen.getByTestId("api-key-status-k-old")).toHaveTextContent("revoked");
    expect(screen.getByTestId("api-key-revoke-k-live")).toBeInTheDocument();
    expect(screen.queryByTestId("api-key-revoke-k-old")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("api-key-purge-k-old"));
    fireEvent.click(await screen.findByTestId("api-key-purge-k-old-confirm"));
    await waitFor(() => expect(api.apiDelete).toHaveBeenCalledWith("/admin/api-keys/k-old/purge"));
  });

  it("filters the key list by status", async () => {
    renderWithProviders(<ApiKeysPage />, { route: "/admin/api-keys" });
    await screen.findByTestId("api-keys-table");

    fireEvent.change(screen.getByTestId("api-key-status-filter"), { target: { value: "revoked" } });
    await waitFor(() => expect(api.apiGet).toHaveBeenCalledWith("/admin/api-keys?status=revoked"));
  });
});

describe("activity log time range UI", () => {
  beforeEach(() => {
    vi.mocked(api.apiGet).mockClear();
  });

  it("applies the selected period to the query and the CSV export", async () => {
    renderWithProviders(<AuditLogPage />, { route: "/admin/audit" });
    await screen.findByTestId("audit-table");

    fireEvent.change(screen.getByTestId("audit-period-filter"), { target: { value: "week" } });
    await waitFor(() => expect(api.apiGet).toHaveBeenCalledWith("/admin/audit?limit=50&period=week"));
    await waitFor(() =>
      expect(screen.getByTestId("audit-export-button")).toHaveAttribute("href", "/api/admin/audit/export?period=week&limit=50")
    );
  });

  it("uses the house select for the time filter", async () => {
    renderWithProviders(<AuditLogPage />, { route: "/admin/audit" });
    const select = screen.getByTestId("audit-period-filter");

    expect(select.tagName).toBe("SELECT");
    expect(select.className).toContain("appearance-none");
    expect(select.parentElement?.tagName).toBe("DIV");
  });
});
