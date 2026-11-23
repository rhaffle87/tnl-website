import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";
import AdminLogin from "@/pages/admin/AdminLogin";
import ContentManager from "@/pages/admin/ContentManager";
import { RegistrarPage, ThemePage } from "@/pages/admin/AdminScreens";
import { renderWithProviders } from "./test-utils";
import * as api from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiGet: vi.fn().mockImplementation((url: string) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          id: "u-admin",
          name: "Super Admin",
          email: "admin@its.ac.id",
          role: "super_admin",
        });
      }
      if (url.includes("/admin/theme")) {
        return Promise.resolve({
          draft: {
            primary_color: "#223027",
            emerald_color: "#5D8A6B",
            obsidian_color: "#0C100E",
            accent_color: "#A8977B",
            accent_hover_color: "#C2B091",
            color_surface: "#FAF7F2",
            color_body: "#1E2521",
            color_tan_text: "#6E604B",
          },
          published: {
            primary_color: "#223027",
            emerald_color: "#5D8A6B",
            accent_color: "#A8977B",
          },
          contrast: [
            { label: "Body text on surface", ratio: 14.65, passes: true },
            { label: "Accent text on button", ratio: 6.43, passes: true },
          ],
        });
      }
      if (url.includes("/admin/registrations")) {
        return Promise.resolve({
          items: [
            {
              id: "reg-1",
              event_title: "Open House TNL 2026",
              email: "peserta@its.ac.id",
              nim: "5024211001",
              status: "attended",
              sheet_synced: true,
              data: { "f_full-name": "Ahmad Dani" },
            },
          ],
          total: 1,
          counts: { pending: 0, accepted: 0, attended: 1 },
        });
      }
      if (url.includes("/admin/content/events")) {
        return Promise.resolve({
          items: [{ id: "ev-1", title: "Cisco Packet Tracer Training", status: "published" }],
          total: 1,
        });
      }
      return Promise.resolve({});
    }),
    apiPost: vi.fn().mockResolvedValue({ ok: true, synced: 1 }),
    apiPut: vi.fn().mockResolvedValue({ id: "ev-1", status: "draft" }),
    apiDelete: vi.fn().mockResolvedValue({ ok: true }),
  };
});

describe("Admin CMS Components", () => {
  it("AdminLogin renders sign-in form with email and password inputs", () => {
    renderWithProviders(<AdminLogin />, { route: "/admin/login" });

    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sign in|Masuk/i })).toBeInTheDocument();
  });

  it("RegistrarPage renders sync sheets action and export buttons", async () => {
    renderWithProviders(<RegistrarPage />, { route: "/admin/registrations" });

    // Sync sheet button exists
    const syncBtn = await screen.findByTestId("sync-sheet-btn");
    expect(syncBtn).toBeInTheDocument();

    // Verify CSV and Excel download links
    const csvLink = screen.getByRole("link", { name: /CSV/i });
    expect(csvLink).toHaveAttribute("href", expect.stringContaining("/api/admin/registrations/export"));

    const excelLink = screen.getByRole("link", { name: /Excel/i });
    expect(excelLink).toHaveAttribute("href", expect.stringContaining("/api/admin/registrations/export-excel"));
  });

  it("ThemePage renders GSM theme tokens with color inputs", async () => {
    renderWithProviders(<ThemePage />, { route: "/admin/theme" });

    // Verify GSM Deep Forest token input
    const primaryInput = await screen.findByTestId("theme-gsm-primary_color");
    expect(primaryInput).toBeInTheDocument();
    expect(primaryInput).toHaveValue("#223027");

    // Verify GSM Warm Sand token input
    const accentInput = screen.getByTestId("theme-gsm-accent_color");
    expect(accentInput).toBeInTheDocument();
    expect(accentInput).toHaveValue("#a8977b");
  });

  it("RegistrarPage renders delete button for admin and confirms deletion", async () => {
    renderWithProviders(<RegistrarPage />, { route: "/admin/registrations" });

    const delBtn = await screen.findByTestId("registration-delete-reg-1");
    expect(delBtn).toBeInTheDocument();

    fireEvent.click(delBtn);

    const confirmBtn = await screen.findByTestId("registration-delete-reg-1-confirm");
    expect(confirmBtn).toBeInTheDocument();

    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.apiDelete).toHaveBeenCalledWith("/admin/registrations/reg-1");
    });
  });

  it("ContentManager renders 1-click Hide/Publish toggle for events and updates status", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/admin/content/:resource" element={<ContentManager />} />
      </Routes>,
      { route: "/admin/content/events" }
    );

    const toggleBtn = await screen.findByTestId("content-toggle-publish-ev-1");
    expect(toggleBtn).toBeInTheDocument();
    expect(toggleBtn).toHaveTextContent("Hide");

    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(api.apiPut).toHaveBeenCalledWith("/admin/content/events/ev-1", { status: "draft" });
    });
  });

  it("RegistrarPage shows the live 15s badge and can pause polling", async () => {
    renderWithProviders(<RegistrarPage />, { route: "/admin/registrations" });

    const badge = await screen.findByTestId("registrations-live-badge");
    expect(badge).toHaveTextContent("Live · 15s");
    expect(screen.getByTestId("registrations-last-updated")).toBeInTheDocument();

    // Check-in keeps working: the delete affordance is still rendered while live.
    expect(await screen.findByTestId("registration-delete-reg-1")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("registrations-live-toggle"));

    await waitFor(() => expect(badge).toHaveTextContent("Live paused"));
    expect(screen.getByTestId("registrations-live-toggle")).toHaveTextContent("Resume");
    expect(screen.getByTestId("registration-delete-reg-1")).toBeInTheDocument();
  });
});
