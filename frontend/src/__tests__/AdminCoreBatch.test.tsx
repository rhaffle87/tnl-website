import { describe, it, expect, vi, beforeEach } from "vitest";
import React, { useRef, useState } from "react";
import { render, fireEvent, screen, waitFor } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Routes, Route } from "react-router-dom";
import { AuditLogPage } from "@/pages/admin/AdminDashboard";
import ContentManager from "@/pages/admin/ContentManager";
import { UsersPage } from "@/pages/admin/AdminScreens";
import { AdminLocaleProvider, useAdminT } from "@/lib/admin-i18n";
import { useFocusTrap } from "@/lib/useFocusTrap";
import { renderWithProviders } from "./test-utils";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiDelete: vi.fn(),
  apiPatch: vi.fn(),
  apiPost: vi.fn(),
  apiPut: vi.fn(),
  contentOffset: 0,
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiGet: mocks.apiGet,
    apiDelete: mocks.apiDelete,
    apiPatch: mocks.apiPatch,
    apiPost: mocks.apiPost,
    apiPut: mocks.apiPut,
  };
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.contentOffset = 0;
  mocks.apiDelete.mockResolvedValue({ ok: true });
  mocks.apiPatch.mockResolvedValue({ ok: true });
  mocks.apiPost.mockResolvedValue({ ok: true });
  mocks.apiPut.mockResolvedValue({ ok: true });
  mocks.apiGet.mockImplementation((url: string) => {
    if (url.includes("/admin/content/posts")) {
      if (url.includes("offset=0")) {
        return Promise.resolve({
          items: [{ id: "p1", title: "First post", status: "published", cover_url: "" }],
          total: 2,
        });
      }
      return Promise.resolve({
        items: [{ id: "d1", title: "Second post", status: "draft", cover_url: "" }],
        total: 2,
      });
    }
    if (url.includes("/admin/users")) {
      return Promise.resolve({
        items: [{ id: "u1", name: "Rafli", email: "rafli@its.ac.id", role: "viewer", active: true }],
        total: 1,
      });
    }
    return Promise.resolve({
      items: [{ id: "a1", created_at: "2026-01-01T00:00:00Z", actor_email: "a@b.co", action: "create", resource: "news" }],
      total: 51,
    });
  });
});

describe("admin core audit fixes (RED first)", () => {
  it("K3: the audit export link forwards the current page limit", async () => {
    renderWithProviders(<AuditLogPage />, { route: "/admin/audit" });

    const link = await screen.findByTestId("audit-export-button");
    expect(link.getAttribute("href")).toContain("limit=50");
  });

  it("A7: the users confirmation dialog is described by its message", async () => {
    renderWithProviders(<UsersPage />);
    await screen.findByTestId("user-row-u1");

    fireEvent.click(screen.getByTestId("user-toggle-u1"));
    const dialog = screen.getByTestId("confirm-dialog");
    const message = dialog.querySelector("p");
    expect(message?.id).toBeTruthy();
    expect(dialog).toHaveAttribute("aria-describedby", message!.id);
  });

  it("K8: deleting after load-more removes the row without a manual reload", async () => {
    let deleted = false;
    const originalGet = mocks.apiGet.getMockImplementation()!;
    mocks.apiDelete.mockImplementation(async () => {
      deleted = true;
      return { ok: true };
    });
    mocks.apiGet.mockImplementation((url: string) => {
      if (deleted && url.includes("/admin/content/posts")) {
        return Promise.resolve({
          items: [{ id: "d1", title: "Second post", status: "draft", cover_url: "" }],
          total: 1,
        });
      }
      return originalGet(url);
    });
    renderWithProviders(
      <Routes>
        <Route path="/admin/content/:resource" element={<ContentManager />} />
      </Routes>,
      { route: "/admin/content/posts" }
    );

    await screen.findByTestId("content-row-p1");
    fireEvent.click(screen.getByTestId("load-more-content"));
    await screen.findByTestId("content-row-d1");

    fireEvent.click(screen.getByTestId("content-delete-p1"));
    fireEvent.click(screen.getByTestId("content-delete-p1-confirm"));

    await waitFor(() => {
      expect(screen.queryByTestId("content-row-p1")).toBeNull();
      expect(screen.getByTestId("content-row-d1")).toBeInTheDocument();
    });
  });

  it("A6: admin labels are Indonesian inside AdminLocaleProvider with id locale", async () => {
    window.localStorage.setItem("tnl-locale", "id");
    renderWithProviders(
      <AdminLocaleProvider>
        <Routes>
          <Route path="/admin/content/:resource" element={<ContentManager />} />
        </Routes>
      </AdminLocaleProvider>,
      { route: "/admin/content/posts" }
    );

    await screen.findByTestId("content-row-p1");
    expect(screen.getByPlaceholderText("Cari posts...")).toBeInTheDocument();
    window.localStorage.removeItem("tnl-locale");
  });

  it("A6: useAdminT defaults to English without a provider", () => {
    function Probe() {
      const t = useAdminT();
      return <span data-testid="probe">{t("adminConfirm")}</span>;
    }
    render(<Probe />);
    expect(screen.getByTestId("probe")).toHaveTextContent("Confirm");
  });

  it("K4: shared trap cycles Tab through links and restores opener focus", () => {
    function Probe() {
      const [open, setOpen] = useState(false);
      const trigger = useRef<HTMLButtonElement>(null);
      const dialog = useRef<HTMLDivElement>(null);
      useFocusTrap(open, dialog, { onEscape: () => setOpen(false) });
      return (
        <>
          <button ref={trigger} onClick={() => setOpen(true)}>Open</button>
          {open && (
            <div ref={dialog}>
              <button>First</button>
              <a href="#target">Link</a>
            </div>
          )}
        </>
      );
    }
    render(<Probe />);
    const trigger = screen.getByRole("button", { name: "Open" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("link", { name: "Link" }));
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "First" }));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("link", { name: "Link" })).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("K4: all four dialog surfaces call the shared focus trap", () => {
    const files = [
      "src/pages/admin/AdminUI.tsx",
      "src/pages/admin/AdminScreens.tsx",
      "src/pages/admin/AdminLayout.tsx",
      "src/components/site/Chrome.tsx",
    ];
    files.forEach((file) => {
      const source = readFileSync(resolve(process.cwd(), file), "utf8");
      expect(source, file).toContain("useFocusTrap(");
    });
  });
});
