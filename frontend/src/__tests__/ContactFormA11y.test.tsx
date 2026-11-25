import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { ContactForm } from "@/components/site/ContactForm";
import { STRINGS } from "@/lib/i18n";
import { renderWithProviders } from "./test-utils";

vi.mock("@/lib/api", () => ({
  apiPost: vi.fn(async () => ({ ok: true, message: "sent" })),
  ApiError: class ApiError extends Error {},
}));

function setLocale(locale: "en" | "id") {
  window.localStorage.setItem("tnl-locale", locale);
}

function submitEmptyForm() {
  renderWithProviders(<ContactForm />);
  fireEvent.click(screen.getByTestId("contact-submit-button"));
}

describe("ContactForm accessibility", () => {
  it("marks every invalid field and links it to an alert error node", () => {
    setLocale("en");
    submitEmptyForm();

    for (const name of ["name", "email", "subject", "message"] as const) {
      const input = screen.getByTestId(`contact-${name}-input`);
      expect(input, name).toHaveAttribute("aria-invalid", "true");
      expect(input, name).toHaveAttribute("aria-describedby", `contact-${name}-error`);
      const error = screen.getByTestId(`contact-${name}-error`);
      expect(error).toHaveAttribute("id", `contact-${name}-error`);
      expect(error).toHaveAttribute("role", "alert");
    }

    const consent = screen.getByTestId("contact-form-consent");
    expect(consent).toHaveAttribute("aria-invalid", "true");
    expect(consent).toHaveAttribute("aria-describedby", "contact-consent-error");
    const consentError = screen.getByTestId("contact-consent-error");
    expect(consentError).toHaveAttribute("id", "contact-consent-error");
    expect(consentError).toHaveAttribute("role", "alert");
  });

  it("focuses the first invalid field after a failed submit", () => {
    setLocale("en");
    submitEmptyForm();
    expect(screen.getByTestId("contact-name-input")).toHaveFocus();
  });

  it("localizes the consent label and privacy link", () => {
    setLocale("en");
    renderWithProviders(<ContactForm />);
    expect(screen.getByText(STRINGS.en.contact_consent_label, { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: STRINGS.en.contact_privacy_link })).toHaveAttribute("href", "/privacy");
  });

  it("gives the consent control a 44px hit area", () => {
    setLocale("id");
    renderWithProviders(<ContactForm />);
    const consent = screen.getByTestId("contact-form-consent");
    expect(consent.closest("label")).toHaveClass("min-h-[44px]");
  });

  it("uses semantic danger tokens for required marks and errors", () => {
    setLocale("en");
    submitEmptyForm();
    const error = screen.getByTestId("contact-name-error");
    expect(error.getAttribute("style")).toContain("var(--tnl-danger)");
    const required = screen.getByText("Your name").querySelector("span") as HTMLElement;
    expect(required.getAttribute("style")).toContain("var(--tnl-danger)");
  });
});
