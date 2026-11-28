import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import AdminLogin, { AdminInviteAccept } from "@/pages/admin/AdminLogin";
import { AdminLocaleProvider } from "@/lib/i18n/admin-i18n";
import { LocaleContext, STRINGS } from "@/lib/i18n/i18n";
import { ApiError } from "@/lib/api/api";

const { apiGetMock, apiPostMock, beginSessionMock, successMock, errorMock } = vi.hoisted(() => ({
  apiGetMock: vi.fn(),
  apiPostMock: vi.fn(),
  beginSessionMock: vi.fn(),
  successMock: vi.fn(),
  errorMock: vi.fn(),
}));

vi.mock("@/lib/api/api", async () => ({
  ...await vi.importActual<typeof import("@/lib/api/api")>("@/lib/api/api"),
  apiGet: apiGetMock,
  apiPost: apiPostMock,
}));
vi.mock("@/lib/api/session", () => ({ beginSession: beginSessionMock }));
vi.mock("@/lib/theme/theme", () => ({ useApplyThemeTokens: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: successMock, error: errorMock } }));

type AuthLocale = "en" | "id" | "without-admin-provider";

function renderAuth(locale: AuthLocale, invite = false) {
  // The public locale remains Indonesian without the admin provider. Auth must
  // still use its default-English contract, not inherit useLocale() directly.
  const siteLocale = locale === "en" ? "en" : "id";
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const routes = (
    <Routes>
      <Route path="/admin/login" element={<AdminLogin />} />
      <Route path="/admin/invite/:token" element={<AdminInviteAccept />} />
      <Route path="/admin" element={<p data-testid="admin-destination">CMS</p>} />
    </Routes>
  );
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[invite ? "/admin/invite/test-token" : "/admin/login"]}>
        <LocaleContext.Provider value={{
          locale: siteLocale,
          setLocale: vi.fn(),
          t: (key) => STRINGS[siteLocale][key],
        }}>
          {locale === "without-admin-provider" ? routes : <AdminLocaleProvider>{routes}</AdminLocaleProvider>}
        </LocaleContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  apiGetMock.mockResolvedValue({
    enabled: true,
    auth_base: "",
    allowed_domains: ["its.ac.id", "student.its.ac.id"],
  });
  apiPostMock.mockResolvedValue({ id: "staff-1" });
  beginSessionMock.mockResolvedValue(undefined);
});

const locales: AuthLocale[] = ["en", "id", "without-admin-provider"];

function fillLogin() {
  fireEvent.change(screen.getByTestId("login-email-input"), { target: { value: "staff@its.ac.id" } });
  fireEvent.change(screen.getByTestId("login-password-input"), { target: { value: "test-password" } });
}

function fillInvite(confirm = "test-password") {
  fireEvent.change(screen.getByTestId("invite-password-input"), { target: { value: "test-password" } });
  fireEvent.change(screen.getByTestId("invite-confirm-input"), { target: { value: confirm } });
}

describe.each(locales)("auth copy: %s", (locale) => {
  const id = locale === "id";

  it("renders the localized login shell and accessible form labels", async () => {
    renderAuth(locale);

    expect(screen.getByRole("heading", { name: id ? "Masuk" : "Sign in" })).toBeInTheDocument();
    expect(screen.getByText(id
      ? "Gunakan akun TNL Studio Anda untuk mengelola situs web laboratorium."
      : "Use your TNL Studio account to manage the laboratory website.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: id ? "Identitas TNL Studio" : "TNL Studio brand" })).toBeInTheDocument();
    expect(screen.getByTestId("login-brand-title")).toHaveTextContent("Telecommunication Network Laboratory");
    expect(screen.getByTestId("login-eyebrow")).toHaveTextContent("TNL STUDIO");
    expect(screen.getByTestId("login-signal-readout")).toHaveTextContent(id ? "SINYAL / DARING" : "SIGNAL / ONLINE");
    expect(screen.getByText(id
      ? "Pengelola konten situs web laboratorium. Seluruh konten situs publik — berita, anggota, program, halaman, dan warna — disunting di sini dengan bahasa yang mudah dipahami."
      : "The content manager for the laboratory website. Everything on the public site — news, members, programmes, pages and colours — is edited here in plain language.")).toBeInTheDocument();
    const meta = screen.getAllByTestId("login-meta-cell");
    expect(meta.map((cell) => cell.textContent)).toEqual(id
      ? ["LaboratoriumTNL", "AksesCMS Staf", "RuangB-301"]
      : ["LaboratoryTNL", "AccessStaff CMS", "RoomB-301"]);
    expect(screen.getByTestId("login-surface-kicker")).toHaveTextContent(id ? "AKSES AMAN" : "SECURE ACCESS");
    expect(screen.getByTestId("login-field-label-email")).toHaveTextContent(id ? "ALAMAT EMAIL" : "EMAIL ADDRESS");
    expect(screen.getByTestId("login-field-label-password")).toHaveTextContent(id ? "KATA SANDI" : "PASSWORD");
    expect(screen.getByLabelText(id ? "Alamat email" : "Email address", { selector: "input" })).toHaveAttribute("autocomplete", "email");
    expect(screen.getByLabelText(id ? "Kata sandi" : "Password", { selector: "input" })).toHaveAttribute("autocomplete", "current-password");
    expect(screen.getByRole("button", { name: id ? "Masuk" : "Sign in" })).toBeEnabled();
    expect(await screen.findByRole("button", { name: id ? "Lanjutkan dengan Google" : "Continue with Google" })).toBeInTheDocument();
    expect(screen.getByText(id ? "atau" : "or", { exact: true })).toBeInTheDocument();
    expect(screen.getByText(id
      ? "Hanya akun yang diundang dengan domain @its.ac.id atau @student.its.ac.id yang dapat masuk dengan Google."
      : "Only invited accounts on @its.ac.id or @student.its.ac.id can sign in with Google.")).toBeInTheDocument();
    expect(screen.getByTestId("login-error")).toBeEmptyDOMElement();
  });

  it("localizes the password visibility control without changing its behavior", () => {
    renderAuth(locale);
    const password = screen.getByTestId("login-password-input");
    const toggle = screen.getByRole("button", { name: id ? "Tampilkan kata sandi" : "Show password" });
    expect(password).toHaveAttribute("type", "password");
    fireEvent.click(toggle);
    expect(password).toHaveAttribute("type", "text");
    expect(toggle).toHaveAccessibleName(id ? "Sembunyikan kata sandi" : "Hide password");
  });

  it("localizes login busy and fallback-error states while retaining entered credentials", async () => {
    let rejectLogin!: (reason: unknown) => void;
    apiPostMock.mockReturnValueOnce(new Promise<never>((_, reject) => { rejectLogin = reject; }));
    renderAuth(locale);
    fillLogin();
    fireEvent.click(screen.getByTestId("login-submit-button"));

    expect(screen.getByRole("button", { name: id ? "Sedang masuk…" : "Signing in…" })).toBeDisabled();
    expect(screen.getByTestId("admin-login-form")).toHaveAttribute("aria-busy", "true");
    await act(async () => { rejectLogin(new Error("Network unavailable")); });

    const fallback = id ? "Tidak dapat masuk. Silakan coba lagi." : "Could not sign in. Please try again.";
    await waitFor(() => expect(screen.getByTestId("login-error")).toHaveTextContent(fallback));
    expect(errorMock).toHaveBeenCalledWith(fallback);
    expect(screen.getByRole("button", { name: id ? "Masuk" : "Sign in" })).toBeEnabled();
    expect(screen.getByTestId("admin-login-form")).toHaveAttribute("aria-busy", "false");
    expect(screen.getByTestId("login-email-input")).toHaveValue("staff@its.ac.id");
    expect(screen.getByTestId("login-password-input")).toHaveValue("test-password");
    expect(screen.queryByTestId("login-totp-input")).toBeNull();
    expect(beginSessionMock).not.toHaveBeenCalled();
  });

  it("localizes a structured TOTP challenge and focuses the code field", async () => {
    apiPostMock.mockRejectedValueOnce(new ApiError(401, {
      detail: { code: "two_factor_required", message: "Verification code required" },
    }));
    renderAuth(locale);
    fillLogin();
    fireEvent.click(screen.getByTestId("login-submit-button"));

    const code = await screen.findByLabelText(id ? "Kode autentikasi dua faktor" : "Two-factor code");
    await waitFor(() => expect(code).toHaveFocus());
    expect(code).toHaveAttribute("inputmode", "numeric");
    expect(screen.getByTestId("login-field-label-code")).toHaveTextContent(id ? "KODE AUTENTIKASI DUA FAKTOR" : "TWO-FACTOR CODE");
    expect(screen.getByText(id
      ? "Buka aplikasi autentikator Anda dan masukkan kode 6 digit."
      : "Open your authenticator app and enter the 6-digit code.")).toBeInTheDocument();
    expect(screen.getByTestId("login-error")).toHaveTextContent(id
      ? "Tidak dapat masuk. Silakan coba lagi."
      : "Could not sign in. Please try again.");
  });

  it("preserves backend TOTP detail and signs in with the unchanged code payload", async () => {
    const detail = "Verification code required by ITS policy.";
    apiPostMock.mockRejectedValueOnce(new ApiError(401, { detail }));
    renderAuth(locale);
    fillLogin();
    fireEvent.click(screen.getByTestId("login-submit-button"));

    const code = await screen.findByTestId("login-totp-input");
    expect(screen.getByTestId("login-error")).toHaveTextContent(detail);
    expect(errorMock).toHaveBeenCalledWith(detail);
    expect(apiPostMock).toHaveBeenNthCalledWith(1, "/auth/login", {
      email: "staff@its.ac.id", password: "test-password", code: null,
    });
    fireEvent.change(code, { target: { value: "123456" } });
    fireEvent.click(screen.getByTestId("login-submit-button"));

    expect(await screen.findByTestId("admin-destination")).toBeInTheDocument();
    expect(apiPostMock).toHaveBeenNthCalledWith(2, "/auth/login", {
      email: "staff@its.ac.id", password: "test-password", code: "123456",
    });
    expect(beginSessionMock).toHaveBeenCalledTimes(1);
    expect(successMock).toHaveBeenCalledWith(id ? "Berhasil masuk." : "Signed in.");
  });

  it("preserves backend validation-array detail instead of translating it", async () => {
    const detail = "Account pending approval by the laboratory.";
    apiPostMock.mockRejectedValueOnce(new ApiError(422, { detail: [{ msg: detail }] }));
    renderAuth(locale);
    fillLogin();
    fireEvent.click(screen.getByTestId("login-submit-button"));
    await waitFor(() => expect(screen.getByTestId("login-error")).toHaveTextContent(detail));
    expect(errorMock).toHaveBeenCalledWith(detail);
    expect(screen.queryByTestId("login-totp-input")).toBeNull();
  });

  it("localizes the disabled Google fallback without starting authentication", async () => {
    renderAuth(locale);
    fireEvent.click(await screen.findByTestId("login-google-button"));
    expect(errorMock).toHaveBeenCalledWith(id
      ? "Login Google saat ini dinonaktifkan. Silakan gunakan email dan kata sandi."
      : "Google Sign-In is currently disabled. Please use email and password.");
    expect(apiPostMock).not.toHaveBeenCalled();
    expect(beginSessionMock).not.toHaveBeenCalled();
  });

  it("renders localized invitation copy and accessible labels in the shared shell", () => {
    renderAuth(locale, true);
    expect(screen.getByRole("heading", { name: id ? "Atur kata sandi Anda" : "Set your password" })).toBeInTheDocument();
    expect(screen.getByText(id
      ? "Pilih kata sandi untuk akun TNL Studio Anda."
      : "Choose a password for your TNL Studio account.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: id ? "Identitas TNL Studio" : "TNL Studio brand" })).toBeInTheDocument();
    expect(screen.getByTestId("login-surface-kicker")).toHaveTextContent(id ? "AKSES AMAN" : "SECURE ACCESS");
    expect(screen.getByTestId("login-meta")).toHaveTextContent("B-301");
    expect(screen.getByTestId("invite-field-label-password")).toHaveTextContent(id ? "KATA SANDI BARU" : "NEW PASSWORD");
    expect(screen.getByTestId("invite-field-label-confirm")).toHaveTextContent(id ? "ULANGI KATA SANDI" : "REPEAT PASSWORD");
    for (const label of id ? ["Kata sandi baru", "Ulangi kata sandi"] : ["New password", "Repeat password"]) {
      const input = screen.getByLabelText(label, { selector: "input" });
      expect(input).toHaveAttribute("autocomplete", "new-password");
      expect(input).toHaveAttribute("minlength", "8");
      expect(input).toBeRequired();
    }
    expect(screen.getByText(id ? "Minimal 8 karakter." : "At least 8 characters.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: id ? "Atur kata sandi dan masuk" : "Set password and sign in" })).toBeEnabled();
    expect(screen.getByTestId("invite-error")).toBeEmptyDOMElement();
  });

  it("localizes both invitation visibility controls independently", () => {
    renderAuth(locale, true);
    const passwordToggle = screen.getByTestId("invite-password-toggle");
    const confirmToggle = screen.getByTestId("invite-confirm-toggle");
    for (const toggle of [passwordToggle, confirmToggle]) {
      expect(toggle).toHaveAccessibleName(id ? "Tampilkan kata sandi" : "Show password");
    }
    fireEvent.click(passwordToggle);
    expect(screen.getByTestId("invite-password-input")).toHaveAttribute("type", "text");
    expect(screen.getByTestId("invite-confirm-input")).toHaveAttribute("type", "password");
    expect(passwordToggle).toHaveAccessibleName(id ? "Sembunyikan kata sandi" : "Hide password");
    fireEvent.click(confirmToggle);
    expect(screen.getByTestId("invite-confirm-input")).toHaveAttribute("type", "text");
    expect(confirmToggle).toHaveAccessibleName(id ? "Sembunyikan kata sandi" : "Hide password");
  });

  it("localizes mismatched-password errors without submitting the invitation", () => {
    renderAuth(locale, true);
    fillInvite("different-password");
    fireEvent.click(screen.getByTestId("invite-submit-button"));
    expect(screen.getByRole("alert")).toHaveTextContent(id
      ? "Kedua kata sandi tidak cocok."
      : "The two passwords do not match.");
    expect(screen.getByTestId("invite-confirm-input")).toHaveFocus();
    expect(screen.getByTestId("invite-accept-form")).toHaveAttribute("aria-busy", "false");
    expect(apiPostMock).not.toHaveBeenCalled();
    expect(beginSessionMock).not.toHaveBeenCalled();
    expect(errorMock).not.toHaveBeenCalled();
  });

  it("localizes invitation busy and fallback-error states without losing values", async () => {
    let rejectInvite!: (reason: unknown) => void;
    apiPostMock.mockReturnValueOnce(new Promise<never>((_, reject) => { rejectInvite = reject; }));
    renderAuth(locale, true);
    fillInvite();
    fireEvent.click(screen.getByTestId("invite-submit-button"));
    expect(screen.getByRole("button", { name: id ? "Menyimpan…" : "Saving…" })).toBeDisabled();
    expect(screen.getByTestId("invite-accept-form")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByTestId("invite-password-input")).toBeDisabled();
    expect(screen.getByTestId("invite-confirm-input")).toBeDisabled();
    expect(apiPostMock).toHaveBeenCalledWith("/auth/accept-invite", { token: "test-token", password: "test-password" });
    await act(async () => { rejectInvite(new Error("Network unavailable")); });
    const fallback = id ? "Tautan undangan ini tidak lagi berlaku." : "This invitation link is no longer valid.";
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(fallback));
    expect(errorMock).toHaveBeenCalledWith(fallback);
    expect(screen.getByTestId("invite-accept-form")).toHaveAttribute("aria-busy", "false");
    expect(screen.getByTestId("invite-submit-button")).toBeEnabled();
    for (const testId of ["invite-password-input", "invite-confirm-input"]) {
      expect(screen.getByTestId(testId)).toBeEnabled();
      expect(screen.getByTestId(testId)).toHaveValue("test-password");
    }
    expect(beginSessionMock).not.toHaveBeenCalled();
  });

  it("preserves authored invitation error details", async () => {
    const detail = "This invitation was revoked by the laboratory administrator.";
    apiPostMock.mockRejectedValueOnce(new ApiError(410, { detail }));
    renderAuth(locale, true);
    fillInvite();
    fireEvent.click(screen.getByTestId("invite-submit-button"));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent(detail));
    expect(errorMock).toHaveBeenCalledWith(detail);
    expect(beginSessionMock).not.toHaveBeenCalled();
  });

  it("localizes invitation success while retaining the token and destination", async () => {
    renderAuth(locale, true);
    fillInvite();
    fireEvent.click(screen.getByTestId("invite-submit-button"));
    expect(await screen.findByTestId("admin-destination")).toBeInTheDocument();
    expect(apiPostMock).toHaveBeenCalledWith("/auth/accept-invite", { token: "test-token", password: "test-password" });
    expect(beginSessionMock).toHaveBeenCalledTimes(1);
    expect(successMock).toHaveBeenCalledWith(id
      ? "Kata sandi Anda telah diatur — selamat datang di TNL Studio."
      : "Your password is set — welcome to TNL Studio.");
  });
});
