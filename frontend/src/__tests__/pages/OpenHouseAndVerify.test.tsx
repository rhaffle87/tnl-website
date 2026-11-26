import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";
import OpenHousePage from "@/pages/OpenHousePage";
import { VerifyPage } from "@/pages/UtilityPages";
import { renderWithProviders } from "./test-utils";
import * as api from "@/lib/api/api";

vi.mock("@/lib/api/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/hooks")>();
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

  it("OpenHousePage renders WhatsApp invite card after registration when url returned", async () => {
    const hooks = await import("@/lib/api/hooks");
    vi.mocked(hooks.useSubmitRegistration).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({
        ok: true,
        whatsapp_group_url: "https://chat.whatsapp.com/EXAMPLE_TEST_GROUP",
      }),
      isPending: false,
    } as any);

    renderWithProviders(<OpenHousePage />, { route: "/open-house" });

    fireEvent.change(screen.getByLabelText(/Nama Lengkap/i), { target: { value: "Peserta Uji" } });
    fireEvent.change(screen.getByPlaceholderText(/5022201045/i), { target: { value: "5024201001" } });
    fireEvent.change(screen.getByLabelText(/Mengapa kamu tertarik/i), {
      target: { value: "Tertarik belajar infrastruktur jaringan telekomunikasi dan cloud native." },
    });

    // Mock file input
    const file = new File(["dummy png"], "follow.png", { type: "image/png" });
    const fileInput = screen.getByLabelText(/Bukti Follow Instagram/i);
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    fireEvent.change(fileInput);

    // Ensure consent checkbox is checked
    const consent = screen.getByLabelText(/UU PDP|Persetujuan/i);
    fireEvent.change(consent, { target: { checked: true } });

    // Submit form
    const form = fileInput.closest("form");
    if (form) {
      fireEvent.submit(form);
    } else {
      const submitBtn = screen.getByRole("button", { name: /Kirim Pendaftaran Open House/i });
      fireEvent.click(submitBtn);
    }

    // Verify WhatsApp card renders with join link and copy button
    const waCard = await screen.findByTestId("open-house-wa-group-card");
    expect(waCard).toBeInTheDocument();

    const joinBtn = screen.getByTestId("open-house-wa-group-join-button");
    expect(joinBtn).toHaveAttribute("href", "https://chat.whatsapp.com/EXAMPLE_TEST_GROUP");
    expect(joinBtn).toHaveAttribute("target", "_blank");
    expect(joinBtn).toHaveAttribute("rel", "noopener noreferrer");

    const copyBtn = screen.getByTestId("open-house-wa-group-copy-button");
    expect(copyBtn).toBeInTheDocument();
    fireEvent.click(copyBtn);
  });

  it("OpenHousePage does not render WhatsApp card if url is absent in response", async () => {
    const hooks = await import("@/lib/api/hooks");
    vi.mocked(hooks.useSubmitRegistration).mockReturnValue({
      mutateAsync: vi.fn().mockResolvedValue({
        ok: true,
      }),
      isPending: false,
    } as any);

    renderWithProviders(<OpenHousePage />, { route: "/open-house" });

    fireEvent.change(screen.getByLabelText(/Nama Lengkap/i), { target: { value: "Peserta Uji Dua" } });
    fireEvent.change(screen.getByPlaceholderText(/5022201045/i), { target: { value: "5024201002" } });
    fireEvent.change(screen.getByLabelText(/Mengapa kamu tertarik/i), {
      target: { value: "Tertarik belajar switching dan routing praktikum laboratorium." },
    });

    const file = new File(["dummy png"], "follow.png", { type: "image/png" });
    const fileInput = screen.getByLabelText(/Bukti Follow Instagram/i);
    Object.defineProperty(fileInput, "files", { value: [file], configurable: true });
    fireEvent.change(fileInput);

    // Ensure consent checkbox is checked
    const consent = screen.getByLabelText(/UU PDP|Persetujuan/i);
    fireEvent.change(consent, { target: { checked: true } });

    const form = fileInput.closest("form");
    if (form) {
      fireEvent.submit(form);
    } else {
      const submitBtn = screen.getByRole("button", { name: /Kirim Pendaftaran Open House/i });
      fireEvent.click(submitBtn);
    }

    await screen.findByText(/Pendaftaran Berhasil Diterima/i);
    expect(screen.queryByTestId("open-house-wa-group-card")).toBeNull();
  });
});
