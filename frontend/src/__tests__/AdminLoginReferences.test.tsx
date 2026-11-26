import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import AdminLogin from "@/pages/admin/AdminLogin";
import { ApiError } from "@/lib/api";
import { renderWithProviders } from "./test-utils";

const { apiGetMock, apiPostMock } = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  apiPostMock: vi.fn(),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiGet: apiGetMock,
    apiPost: apiPostMock,
  };
});

describe("AdminLogin — editorial auth reference contract", () => {
  beforeEach(() => {
    apiPostMock.mockReset();
    apiGetMock.mockClear();
    apiGetMock.mockImplementation((url: string) => {
      if (url.includes("/auth/google/config")) {
        return Promise.resolve({ enabled: true, auth_base: "https://accounts.example.test", allowed_domains: ["its.ac.id"] });
      }
      if (url.includes("/admin/theme")) return Promise.resolve({});
      return Promise.resolve({});
    });
    apiPostMock.mockResolvedValue({ id: "u1", email: "staff@its.ac.id", role: "admin" });
  });

  it("uses a split shell with the inverse brand panel first and the paper form panel second", () => {
    renderWithProviders(<AdminLogin />, { route: "/admin/login" });

    const shell = screen.getByTestId("login-shell");
    const brand = screen.getByTestId("login-brand-panel");
    const form = screen.getByTestId("login-form-panel");

    expect(shell.contains(brand)).toBe(true);
    expect(shell.contains(form)).toBe(true);
    expect(shell.firstElementChild).toBe(brand);
    expect(shell.lastElementChild).toBe(form);
    expect(brand.className).toContain("tnl-hero-gradient");
    expect(brand.className).toContain("lg:flex");
    expect(shell.getAttribute("style")).toContain("var(--tnl-surface)");
  });

  it("renders the mono eyebrow hierarchy, signal motif and three-cell meta row on the inverse panel", () => {
    renderWithProviders(<AdminLogin />, { route: "/admin/login" });

    expect(screen.getByTestId("login-eyebrow")).toHaveTextContent("TNL STUDIO");
    expect(screen.getByTestId("login-brand-title")).toHaveTextContent("Telecommunication Network Laboratory");
    expect(screen.getAllByTestId("login-signal-dot").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByTestId("login-meta")).toBeInTheDocument();
    expect(screen.getAllByTestId("login-meta-cell").length).toBe(3);
    expect(screen.getByTestId("login-meta")).toHaveTextContent("B-301");
  });

  it("uses the restrained form card with micro-labels and a password visibility control", () => {
    renderWithProviders(<AdminLogin />, { route: "/admin/login" });

    expect(screen.getByTestId("login-surface-kicker")).toHaveTextContent("SECURE ACCESS");
    expect(screen.getByTestId("login-mobile-brand")).toBeInTheDocument();
    expect(screen.getByTestId("login-field-label-email")).toHaveTextContent("EMAIL ADDRESS");
    expect(screen.getByTestId("login-field-label-password")).toHaveTextContent("PASSWORD");

    const toggle = screen.getByTestId("login-password-toggle");
    expect(toggle).toHaveAttribute("aria-label", "Show password");
    expect(screen.getByTestId("login-password-input")).toHaveAttribute("type", "password");

    fireEvent.click(toggle);
    expect(screen.getByTestId("login-password-input")).toHaveAttribute("type", "text");
    expect(toggle).toHaveAttribute("aria-label", "Hide password");
  });

  it("keeps a reserved inline error region and preserves entered values after a failed sign-in", async () => {
    apiPostMock.mockRejectedValueOnce(new ApiError(401, { detail: "Invalid credentials" }));

    renderWithProviders(<AdminLogin />, { route: "/admin/login" });

    const errorRegion = screen.getByTestId("login-error");
    expect(errorRegion).toHaveAttribute("role", "alert");
    expect(errorRegion).toBeEmptyDOMElement();

    const email = screen.getByTestId("login-email-input");
    const password = screen.getByTestId("login-password-input");
    fireEvent.change(email, { target: { value: "staff@its.ac.id" } });
    fireEvent.change(password, { target: { value: "secret" } });
    fireEvent.click(screen.getByTestId("login-submit-button"));

    await waitFor(() => expect(errorRegion).toHaveTextContent("Invalid credentials"));
    expect(email).toHaveValue("staff@its.ac.id");
    expect(password).toHaveValue("secret");
  });

  it("keeps the secondary Google route inside the same paper surface", async () => {
    renderWithProviders(<AdminLogin />, { route: "/admin/login" });

    const formPanel = screen.getByTestId("login-form-panel");
    const google = await screen.findByTestId("login-google-button");

    expect(formPanel.contains(google)).toBe(true);
    expect(screen.getByText("or")).toBeInTheDocument();
    expect(screen.getByText(/invited accounts/i)).toBeInTheDocument();
  });

  it("reveals and focuses the code field on an explicit two-factor challenge", async () => {
    apiPostMock.mockRejectedValueOnce(new ApiError(401, {
      detail: { code: "two_factor_required", message: "Verification code required" },
    }));

    renderWithProviders(<AdminLogin />, { route: "/admin/login" });
    fireEvent.change(screen.getByTestId("login-email-input"), { target: { value: "staff@its.ac.id" } });
    fireEvent.change(screen.getByTestId("login-password-input"), { target: { value: "secret" } });
    fireEvent.click(screen.getByTestId("login-submit-button"));

    const code = await screen.findByTestId("login-totp-input");
    await waitFor(() => expect(document.activeElement).toBe(code));
    expect(screen.getByTestId("admin-login-form")).toHaveAttribute("aria-busy", "false");
    await waitFor(() => expect(apiPostMock).toHaveBeenCalledTimes(1));
  });

  it("keeps invite acceptance on the same mono-label, inline-error contract", async () => {
    const { AdminInviteAccept } = await import("@/pages/admin/AdminLogin");

    renderWithProviders(<AdminInviteAccept />, { route: "/admin/invite/tok" });

    expect(screen.getByTestId("invite-field-label-password")).toHaveTextContent("NEW PASSWORD");
    expect(screen.getByTestId("invite-password-toggle")).toHaveAttribute("aria-label", "Show password");
    expect(screen.getByTestId("invite-confirm-toggle")).toHaveAttribute("aria-label", "Show password");

    const password = screen.getByTestId("invite-password-input");
    const confirm = screen.getByTestId("invite-confirm-input");
    fireEvent.change(password, { target: { value: "secret-one" } });
    fireEvent.change(confirm, { target: { value: "secret-two" } });
    fireEvent.click(screen.getByTestId("invite-submit-button"));

    expect(screen.getByTestId("invite-error")).toHaveTextContent(/do not match/i);
    expect(document.activeElement).toBe(confirm);
    expect(apiPostMock).not.toHaveBeenCalled();
  });
});
