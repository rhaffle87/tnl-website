import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import AdminLogin from "@/pages/admin/AdminLogin";
import { RegistrarPage, ThemePage } from "@/pages/admin/AdminScreens";
import { renderWithProviders } from "./test-utils";
import * as api from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiGet: vi.fn().mockImplementation((url: string) => {
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
          items: [{ id: "ev-1", title: "Open House TNL 2026" }],
          total: 1,
        });
      }
      return Promise.resolve({});
    }),
    apiPost: vi.fn().mockResolvedValue({ ok: true, synced: 1 }),
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
});
