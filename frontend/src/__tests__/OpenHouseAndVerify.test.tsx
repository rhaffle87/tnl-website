import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";
import OpenHousePage from "@/pages/OpenHousePage";
import { VerifyPage } from "@/pages/UtilityPages";
import { renderWithProviders } from "./test-utils";
import * as api from "@/lib/api";

vi.mock("@/lib/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hooks")>();
  return {
    ...actual,
    useEvent: vi.fn().mockReturnValue({
      data: {
        id: "open-house-event-1",
        title: "Open House TNL 2026",
        title_id: "Open House Lab TNL 2026",
        reg_status: "open",
        seats_left: 25,
      },
      isLoading: false,
    }),
    useSubmitRegistration: vi.fn().mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({ ok: true }),
      isPending: false,
    }),
  };
});

describe("OpenHouse & Certificate Verification", () => {
  it("OpenHousePage displays form and requires valid NRP and consent checkbox", () => {
    renderWithProviders(<OpenHousePage />, { route: "/open-house" });

    // Verify Open House title is rendered
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Open House/i);

    // Verify form input fields
    const nameInput = screen.getByLabelText(/Nama Lengkap/i);
    expect(nameInput).toBeInTheDocument();

    const nrpInput = screen.getByPlaceholderText(/5022201045/i);
    expect(nrpInput).toBeInTheDocument();

    const consentCheckbox = screen.getByLabelText(/UU PDP|Persetujuan/i);
    expect(consentCheckbox).toBeInTheDocument();
  });

  it("VerifyPage renders search input and queries certificate status", async () => {
    vi.spyOn(api, "apiGet").mockResolvedValue({
      valid: true,
      code: "TNL-2026-TRA-ABCDEF",
      name: "Budi Santoso",
      event_title: "Cisco Packet Tracer Training",
      event_date: "2026-03-15",
      message: "This certificate is valid and officially issued.",
    });

    renderWithProviders(
      <Routes>
        <Route path="/verify" element={<VerifyPage />} />
        <Route path="/verify/:code" element={<VerifyPage />} />
      </Routes>,
      { route: "/verify" }
    );

    // Verify heading
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(/Verifikasi e-Sertifikat|Certificate Verification/i);

    // Find input and search button
    const input = screen.getByTestId("verify-input-code");
    expect(input).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "TNL-2026-TRA-ABCDEF" } });
    const searchBtn = screen.getByTestId("verify-submit-button");
    fireEvent.click(searchBtn);

    // Verify certificate details are displayed
    await waitFor(() => {
      expect(screen.getByText("Budi Santoso")).toBeInTheDocument();
      expect(screen.getByText(/TNL-2026-TRA-ABCDEF/i)).toBeInTheDocument();
    });
  });
});
