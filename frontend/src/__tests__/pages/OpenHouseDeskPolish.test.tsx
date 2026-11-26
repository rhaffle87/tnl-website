import { describe, it, expect, vi, beforeEach, afterAll } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { RegistrarPage } from "@/pages/admin/AdminScreens";
import { renderWithProviders } from "./test-utils";
import * as api from "@/lib/api/api";
import { FEATURES } from "@/lib/utils/features";

vi.mock("@/lib/api/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/api")>("@/lib/api/api");
  return {
    ...actual,
    apiGet: vi.fn().mockImplementation((url: string) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({ id: "u-admin", name: "Super Admin", email: "admin@its.ac.id", role: "registrar" });
      }
      if (url.includes("/admin/content/events")) {
        return Promise.resolve({
          items: [
            { id: "ev-oh", title: "Open House TNL 2026", capacity: 30, status: "published" },
            { id: "ev-draft", title: "Draft training", capacity: 40, status: "draft" },
          ],
          total: 2,
        });
      }
      if (url.includes("/admin/registrations")) {
        return Promise.resolve({
          items: [
            {
              id: "reg-1",
              event_id: "ev-oh",
              event_title: "Open House TNL 2026",
              email: "hadir@its.ac.id",
              nim: "5024211001",
              display_name: "Ahmad Dani",
              status: "attended",
              data: {},
            },
            {
              id: "reg-2",
              event_id: "ev-oh",
              event_title: "Open House TNL 2026",
              email: "belum@its.ac.id",
              nim: "5024211002",
              display_name: "Siti Rahma",
              status: "accepted",
              data: {},
            },
          ],
          total: 2,
          counts: { accepted: 1, attended: 1, rejected: 0 },
        });
      }
      return Promise.resolve({});
    }),
    apiPost: vi.fn().mockResolvedValue({ ok: true }),
    apiPatch: vi.fn().mockResolvedValue({ ok: true }),
    apiDelete: vi.fn().mockResolvedValue({ ok: true }),
  };
});

describe("Open House check-in desk polish (flags enabled for regression coverage)", () => {
  beforeEach(() => {
    FEATURES.doorCheckIn = true;
    FEATURES.certificates = true;
    vi.mocked(api.apiPost).mockClear();
  });

  afterAll(() => {
    FEATURES.doorCheckIn = false;
    FEATURES.certificates = false;
  });

  it("renders the real-time KPI strip from current registrations and event quota", async () => {
    renderWithProviders(<RegistrarPage />, { route: "/admin/registrations" });

    expect(await screen.findByTestId("checkin-kpi-registered")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("checkin-kpi-registered")).toHaveTextContent("2 / 30"));
    expect(screen.getByTestId("checkin-kpi-attended")).toHaveTextContent("1");
    expect(screen.getByTestId("checkin-kpi-attended")).toHaveTextContent("50%");
    expect(screen.getByTestId("checkin-kpi-pending")).toHaveTextContent("1");
    expect(screen.queryByTestId("checkin-kpi-rejected")).not.toBeInTheDocument();
  });

  it("keeps database exports without retired integration or scoring controls", async () => {
    renderWithProviders(<RegistrarPage />, { route: "/admin/registrations" });
    expect(await screen.findByTestId("registration-row-reg-2")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sync sheets|score registrations/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Quality" })).not.toBeInTheDocument();
    expect(screen.queryByText(/not scored/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("registrations-export-button")).toHaveAttribute("href", "/api/admin/registrations/export");
    expect(screen.getByTestId("registrations-export-excel-button")).toHaveAttribute("href", "/api/admin/registrations/export-excel");
    expect(screen.getByTestId("checkin-submit-button")).toHaveClass("whitespace-nowrap", "shrink-0", "px-5");
  });

  it("shows an instant success banner with name, NRP and check-in time", async () => {
    vi.mocked(api.apiPost).mockResolvedValueOnce({
      name: "Siti Rahma",
      message: "checked in",
      time: "09:41:12",
    });
    renderWithProviders(<RegistrarPage />, { route: "/admin/registrations" });

    fireEvent.change(await screen.findByTestId("checkin-code-input"), { target: { value: "OH-123" } });
    fireEvent.click(screen.getByTestId("checkin-submit-button"));

    const banner = await screen.findByTestId("checkin-result-banner");
    expect(banner).toHaveTextContent("Siti Rahma");
    expect(banner).toHaveTextContent("09:41:12");
    expect(banner).toHaveAttribute("role", "status");
  });

  it("shows a clear error banner and supports Enter to submit", async () => {
    vi.mocked(api.apiPost).mockRejectedValueOnce(new Error("Kode tidak ditemukan"));
    renderWithProviders(<RegistrarPage />, { route: "/admin/registrations" });

    const input = await screen.findByTestId("checkin-code-input");
    fireEvent.change(input, { target: { value: "BAD-CODE" } });
    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    const banner = await screen.findByTestId("checkin-result-banner");
    expect(banner).toHaveAttribute("role", "alert");
    expect(banner).toHaveTextContent("No registration matches this code.");
    expect(api.apiPost).toHaveBeenCalledWith("/admin/registrations/checkin", { code: "BAD-CODE" });
  });

  it("renders stacked participant cards with quick actions for the door desk", async () => {
    renderWithProviders(<RegistrarPage />, { route: "/admin/registrations" });

    const card = await screen.findByTestId("registration-mobile-card-reg-2");
    expect(card).toHaveTextContent("Siti Rahma");
    expect(card).toHaveTextContent("belum@its.ac.id");
    expect(card).toHaveTextContent("5024211002");
    expect(card.querySelector('[data-testid="registration-checkin-reg-2"]')).not.toBeNull();
  });
});

describe("temporarily hidden desks", () => {
  beforeEach(() => {
    FEATURES.doorCheckIn = false;
    FEATURES.certificates = false;
  });

  it("hides check-in and certificate entry points while keeping registration management", async () => {
    renderWithProviders(<RegistrarPage />, { route: "/admin/registrations" });

    expect(await screen.findByTestId("registrations-event-filter")).toBeInTheDocument();
    expect(screen.queryByTestId("checkin-code-input")).not.toBeInTheDocument();
    expect(screen.queryByTestId("checkin-submit-button")).not.toBeInTheDocument();
    expect(screen.queryByTestId("issue-certificates-btn")).not.toBeInTheDocument();
    expect(screen.queryByText("Certificate")).not.toBeInTheDocument();
    expect(screen.queryByTestId("registration-checkin-reg-2")).not.toBeInTheDocument();
    expect(await screen.findByTestId("registration-mobile-card-reg-2")).toBeInTheDocument();
  });
});
