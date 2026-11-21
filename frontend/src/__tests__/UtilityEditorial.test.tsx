import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import OpenHousePage from "@/pages/OpenHousePage";
import { PrivacyPage, TermsPage } from "@/pages/LegalPages";
import { DynamicCmsPage, NotFoundPage, VerifyPage } from "@/pages/UtilityPages";
import * as api from "@/lib/api";
import { renderWithProviders } from "./test-utils";

const mocks = vi.hoisted(() => ({
  event: { data: { id: "cms-open-house", title: "Research Open Day", title_id: "Hari Riset Terbuka", description: "Meet the laboratory.", description_id: "Temui tim laboratorium.", gallery_images: ["/cms-lab.jpg"] }, isLoading: false },
  submit: vi.fn().mockResolvedValue({ ok: true }),
}));
vi.mock("@/lib/hooks", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/hooks")>(),
  useEvent: () => mocks.event,
  useSubmitRegistration: () => ({ mutateAsync: mocks.submit, isPending: false }),
}));

beforeEach(() => { vi.restoreAllMocks(); mocks.submit.mockClear(); localStorage.setItem("tnl-locale", "id"); });

describe("Editorial Open House", () => {
  it("connects the CMS-led invitation to an accessible registration section", () => {
    renderWithProviders(<OpenHousePage />, { route: "/open-house" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hari Riset Terbuka");
    expect(screen.getByText("Temui tim laboratorium.")).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Formulir Pendaftaran Peserta" })).toHaveAttribute("id", "form-section");
    expect(screen.getByRole("link", { name: /Isi Formulir/ })).toHaveAttribute("href", "#form-section");
    expect(screen.getByRole("heading", { level: 1 }).closest(".utility-editorial")).not.toBeNull();
    expect(document.querySelector('img[src="/cms-lab.jpg"]')).not.toBeNull();
  });
});

describe("Editorial policy reading", () => {
  it.each([
    ["privacy", PrivacyPage, 12],
    ["terms", TermsPage, 10],
  ] as const)("preserves %s content and exposes the current section in its index", (slug, Page, count) => {
    renderWithProviders(<Page />, { route: `/${slug}` });
    expect(screen.getByTestId(`${slug}-page`)).toHaveClass("legal-editorial");
    expect(screen.getByTestId("toc-link-sec-1")).toHaveAttribute("aria-current", "location");
    fireEvent.click(screen.getByTestId("toc-link-sec-5"));
    expect(screen.getByTestId("toc-link-sec-5")).toHaveAttribute("aria-current", "location");
    expect(screen.getByTestId("toc-link-sec-1")).not.toHaveAttribute("aria-current");
    expect(document.querySelectorAll(".legal-reading > section")).toHaveLength(count);
    expect(screen.getByTestId(`cross-link-${slug === "privacy" ? "terms" : "privacy"}`)).toHaveAttribute("href", slug === "privacy" ? "/terms" : "/privacy");
  });
});

describe("Editorial public utilities", () => {
  it("introduces the lookup workflow without requesting a certificate on the idle route", () => {
    const get = vi.spyOn(api, "apiGet");
    renderWithProviders(<VerifyPage />, { route: "/verify" });
    expect(screen.getByRole("heading", { name: "Cara memverifikasi" })).toBeInTheDocument();
    expect(screen.getByTestId("verify-submit-button")).toBeDisabled();
    expect(get.mock.calls.some(([url]) => url.startsWith("/verify/"))).toBe(false);
    expect(screen.getByTestId("verify-input-code")).toHaveAttribute("aria-describedby", "verify-code-help");
  });

  it("presents an invalid deep link as an announced result and resets to the lookup desk", async () => {
    vi.spyOn(api, "apiGet").mockRejectedValue(new Error("missing"));
    renderWithProviders(<Routes><Route path="/verify/:code?" element={<VerifyPage />} /></Routes>, { route: "/verify/MISSING" });
    expect(await screen.findByTestId("verify-invalid")).toHaveAttribute("role", "status");
    fireEvent.click(screen.getByRole("button", { name: "Coba Kode Lain" }));
    expect(screen.getByTestId("verify-input-code")).toHaveValue("");
    expect(screen.getByRole("heading", { name: "Cara memverifikasi" })).toBeInTheDocument();
  });

  it("gives an unknown URL a clear document heading and home/contact recovery routes", () => {
    renderWithProviders(<NotFoundPage />, { route: "/unknown" });
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
    expect(screen.getByTestId("not-found-home-button")).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: /Hubungi/ })).toHaveAttribute("href", "/contact");
    expect(screen.getByTestId("not-found-empty-state")).toBeInTheDocument();
  });
});


describe("Preserved public data flows", () => {
  it("keeps dynamic CMS slug loading and authored blocks", async () => {
    let resolvePage!: (value: unknown) => void;
    const pending = new Promise(resolve => { resolvePage = resolve; });
    const get = vi.spyOn(api, "apiGet").mockImplementation((url) => url === "/public/pages/research-guide" ? pending as any : Promise.resolve({}) as any);
    renderWithProviders(<Routes><Route path="/page/:slug" element={<DynamicCmsPage />} /></Routes>, { route: "/page/research-guide" });
    expect(screen.getByTestId("cms-page-research-guide-loading")).toBeInTheDocument();
    resolvePage({ slug: "research-guide", blocks: [{ id: "intro", type: "hero", props: { title_before: "Research Guide", title_before_id: "Panduan Riset" } }] });
    expect(await screen.findByRole("heading", { level: 1, name: "Panduan Riset" })).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith("/public/pages/research-guide");
    expect(screen.getByTestId("cms-page-research-guide")).toBeInTheDocument();
  });

  it("retains the dynamic CMS unavailable state", async () => {
    vi.spyOn(api, "apiGet").mockRejectedValue(new Error("missing page"));
    renderWithProviders(<Routes><Route path="/page/:slug" element={<DynamicCmsPage />} /></Routes>, { route: "/page/unknown" });
    expect(await screen.findByTestId("cms-page-unknown-empty-state")).toBeInTheDocument();
  });

  it("preserves valid deep-link verification, PDF target, and reset", async () => {
    vi.spyOn(api, "apiGet").mockResolvedValue({ valid: true, name: "Research Participant", event_title: "Network Workshop", event_date: "2026-11-20", code: "TNL-A1", message: "Valid" });
    renderWithProviders(<Routes><Route path="/verify/:code?" element={<VerifyPage />} /></Routes>, { route: "/verify/TNL-A1" });
    expect(screen.getByTestId("verify-submit-button")).toBeDisabled();
    expect(await screen.findByTestId("verify-valid")).toHaveTextContent("Research Participant");
    expect(screen.getByTestId("download-certificate-btn")).toHaveAttribute("href", "/api/certificates/TNL-A1/pdf");
    expect(screen.getByTestId("download-certificate-btn")).toHaveAttribute("download");
    fireEvent.click(screen.getByRole("button", { name: "Verifikasi Sertifikat Lain" }));
    expect(screen.queryByTestId("verify-valid")).not.toBeInTheDocument();
    expect(screen.getByTestId("verify-input-code")).toHaveValue("");
  });

  it("keeps the registration FormData contract and peer-registration reset", async () => {
    mocks.submit.mockResolvedValueOnce({ ok: true, whatsapp_group_url: "https://chat.whatsapp.com/test" });
    renderWithProviders(<OpenHousePage />, { route: "/open-house" });
    fireEvent.change(screen.getByLabelText(/Nama Lengkap/), { target: { value: "  Student Name  " } });
    fireEvent.change(screen.getByLabelText(/NRP \(Nomor/), { target: { value: "5022-201045" } });
    fireEvent.change(screen.getByLabelText(/Mengapa kamu/), { target: { value: "  Saya tertarik belajar jaringan telekomunikasi.  " } });
    const file = new File(["fixture"], "follow.png", { type: "image/png" });
    const upload = screen.getByLabelText(/Bukti Follow Instagram/);
    fireEvent.change(upload, { target: { files: [file] } });
    fireEvent.submit(upload.closest("form")!);
    await screen.findByText("Pendaftaran Berhasil Diterima!");
    const payload = mocks.submit.mock.calls[0][0] as FormData;
    expect(Array.from(payload.keys())).toEqual(["consent", "f_nama-lengkap", "f_nrp-nomor-registrasi-pokok", "f_angkatan", "f_mengapa-kamu-tertarik-untuk-ikut-open-house-tnl", "f_bukti-follow-instagram-tnlab-its"]);
    expect(payload.get("consent")).toBe("1");
    expect(payload.get("f_nama-lengkap")).toBe("Student Name");
    expect(payload.get("f_nrp-nomor-registrasi-pokok")).toBe("5022201045");
    expect(payload.get("f_bukti-follow-instagram-tnlab-its")).toBe(file);
    expect(screen.getByTestId("open-house-wa-group-join-button")).toHaveAttribute("href", "https://chat.whatsapp.com/test");
    fireEvent.click(screen.getByRole("button", { name: "Daftar Lagi untuk Rekan" }));
    expect(screen.getByLabelText(/Nama Lengkap/)).toHaveValue("");
    expect(screen.getByLabelText(/Mengapa kamu/)).toHaveValue("");
    expect(screen.queryByTestId("open-house-wa-group-card")).not.toBeInTheDocument();
  });
});
