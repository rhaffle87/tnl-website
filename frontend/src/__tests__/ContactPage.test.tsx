import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import ContactPage from "@/pages/ContactPage";
import { renderWithProviders } from "./test-utils";
import * as api from "@/lib/api";

describe("ContactPage Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renders compact technical hero with quick info strip", () => {
    renderWithProviders(<ContactPage />, { route: "/contact" });

    expect(screen.getByText(/ROOM B-301 · SURABAYA/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: /Hubungi Kami|Contact the Lab/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Gedung B, Ruang B-301/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Departemen Teknik Elektro ITS/i).length).toBeGreaterThan(0);
  });

  it("renders laboratory address card with coordinates and copy address button", async () => {
    renderWithProviders(<ContactPage />, { route: "/contact" });

    expect(screen.getByTestId("contact-address-card")).toBeInTheDocument();
    expect(screen.getByText(/7°17'02"S 112°47'47"E/i)).toBeInTheDocument();

    const copyBtn = screen.getByTestId("copy-address-button");
    expect(copyBtn).toBeInTheDocument();

    fireEvent.click(copyBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      expect.stringContaining("Gedung B, Ruang B-301")
    );
  });

  it("renders official channels and copies email", async () => {
    renderWithProviders(<ContactPage />, { route: "/contact" });

    expect(screen.getByTestId("contact-channels-card")).toBeInTheDocument();
    expect(screen.getByTestId("official-email-link")).toHaveAttribute("href", "mailto:telconnetlab@gmail.com");
    expect(screen.getByTestId("official-instagram-link")).toHaveAttribute("href", expect.stringContaining("instagram.com"));

    const copyEmailBtn = screen.getByTestId("copy-email-button");
    fireEvent.click(copyEmailBtn);
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("telconnetlab@gmail.com");
  });

  it("clicking quick topic pills populates the subject field", () => {
    renderWithProviders(<ContactPage />, { route: "/contact" });

    const subjectInput = screen.getByTestId("contact-subject-input") as HTMLInputElement;
    expect(subjectInput.value).toBe("");

    const researchPill = screen.getByTestId("topic-pill-research");
    fireEvent.click(researchPill);
    expect(subjectInput.value).toMatch(/Kolaborasi Riset|Research Collaboration/i);

    const trainingPill = screen.getByTestId("topic-pill-training");
    fireEvent.click(trainingPill);
    expect(subjectInput.value).toMatch(/Pelatihan & Sertifikasi|Training & Certification/i);
  });

  it("validates required fields including PDP consent", async () => {
    renderWithProviders(<ContactPage />, { route: "/contact" });

    const submitBtn = screen.getByTestId("contact-submit-button");
    fireEvent.click(submitBtn);

    expect(await screen.findByTestId("contact-name-error")).toBeInTheDocument();
    expect(screen.getByTestId("contact-email-error")).toBeInTheDocument();
    expect(screen.getByTestId("contact-subject-error")).toBeInTheDocument();
    expect(screen.getByTestId("contact-message-error")).toBeInTheDocument();
    expect(screen.getByTestId("contact-consent-error")).toBeInTheDocument();
  });

  it("submits message successfully when form is filled and consent is checked", async () => {
    const apiPostSpy = vi.spyOn(api, "apiPost").mockResolvedValue({
      ok: true,
      message: "Thank you — your message has been received.",
    });

    renderWithProviders(<ContactPage />, { route: "/contact" });

    fireEvent.change(screen.getByTestId("contact-name-input"), { target: { value: "Ahmad Dahlan" } });
    fireEvent.change(screen.getByTestId("contact-email-input"), { target: { value: "ahmad@example.com" } });
    fireEvent.change(screen.getByTestId("contact-subject-input"), { target: { value: "Inquiry on 5G lab facilities" } });
    fireEvent.change(screen.getByTestId("contact-message-input"), { target: { value: "We would like to visit the lab next month." } });
    fireEvent.click(screen.getByTestId("contact-pdp-consent-checkbox"));

    fireEvent.click(screen.getByTestId("contact-submit-button"));

    await waitFor(() => {
      expect(apiPostSpy).toHaveBeenCalledWith("/contact", {
        name: "Ahmad Dahlan",
        email: "ahmad@example.com",
        subject: "Inquiry on 5G lab facilities",
        message: "We would like to visit the lab next month.",
        company_website: "",
      });
    });

    expect(await screen.findByTestId("contact-form-success")).toBeInTheDocument();
    expect(screen.getByTestId("send-another-message-button")).toBeInTheDocument();

    // Resetting form returns to empty form
    fireEvent.click(screen.getByTestId("send-another-message-button"));
    expect(screen.getByTestId("contact-form")).toBeInTheDocument();
  });

  it("renders interactive campus map section with iframe, actions, and title", () => {
    renderWithProviders(<ContactPage />, { route: "/contact" });

    expect(screen.getByTestId("contact-map-section")).toBeInTheDocument();
    expect(screen.getByTestId("map-open-google-maps")).toHaveAttribute("href", expect.stringContaining("maps.google.com"));
    expect(screen.getByTestId("map-get-directions")).toHaveAttribute("href", expect.stringContaining("destination=Departemen+Teknik+Elektro+ITS"));

    const iframe = screen.getByTestId("google-maps-iframe");
    expect(iframe).toBeInTheDocument();
    expect(iframe).toHaveAttribute("title", "Lokasi Laboratorium Jaringan Telekomunikasi ITS - Gedung B Ruang B-301");
    expect(iframe).toHaveAttribute("loading", "lazy");
    expect(iframe).toHaveAttribute("referrerPolicy", "no-referrer-when-downgrade");
  });
});
