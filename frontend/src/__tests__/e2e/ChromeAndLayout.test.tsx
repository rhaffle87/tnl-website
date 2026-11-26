import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { SiteHeader, SiteFooter, SiteCollaborationBand, MobileRegistrationBar } from "@/components/site/Chrome";
import { SmoothScrollProvider } from "@/components/site/SmoothScrollProvider";
import { renderWithProviders } from "./test-utils";

vi.mock("@/lib/api/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/hooks")>();
  return {
    ...actual,
    useEvents: vi.fn().mockReturnValue({
      data: [
        {
          id: "ev-open-house",
          slug: "open-house-tnl",
          title: "Open House TNL 2026",
          status: "published",
        },
      ],
      isLoading: false,
    }),
  };
});

describe("Chrome and Layout Components", () => {
  it("SiteHeader renders laboratory branding and main navigation items", () => {
    renderWithProviders(<SiteHeader />, { route: "/" });
    expect(screen.getByText(/Laboratorium Jaringan Telekomunikasi|Telecommunication Network/i)).toBeInTheDocument();
  });

  it("SiteHeader renders borderless TnlLogo with auto theme switching images", () => {
    const { container } = renderWithProviders(<SiteHeader />, { route: "/" });
    const headerLogoLink = screen.getByTestId("header-logo-link");
    expect(headerLogoLink).toBeInTheDocument();

    // Ensure no dark box wrapper with border
    expect(headerLogoLink.querySelector(".bg-\\[\\#111613\\]")).toBeNull();

    // Verify auto switch logo images
    const darkLogo = container.querySelector('img[src="/assets/brand/tnl-logo-dark.svg"]');
    const whiteLogo = container.querySelector('img[src="/assets/brand/tnl-logo-white.svg"]');
    expect(darkLogo).toBeInTheDocument();
    expect(darkLogo).toHaveClass("block", "dark:hidden");
    expect(whiteLogo).toBeInTheDocument();
    expect(whiteLogo).toHaveClass("hidden", "dark:block");
  });

  it("SiteCollaborationBand renders collaboration prompt", () => {
    renderWithProviders(<SiteCollaborationBand show={true} />, { route: "/" });
    expect(screen.getByText(/Tertarik berkolaborasi|Interested in collaborating/i)).toBeInTheDocument();
  });

  it("SiteFooter makes the lab identity the only brand headline and keeps both nav groups", () => {
    const { container } = renderWithProviders(<SiteFooter />, { route: "/" });
    const footer = screen.getByTestId("site-footer");

    expect(screen.getByText(/Ruang B-301|Room B-301/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Departemen Teknik Elektro|Department of Electrical/i).length).toBeGreaterThan(0);
    expect(footer.querySelectorAll("h2")).toHaveLength(1);
    expect(container.querySelector(".signal-footer-wordmark")).toBeNull();
    expect(footer.querySelectorAll("svg text")).toHaveLength(0);
    expect(footer.querySelectorAll("nav")).toHaveLength(2);

    // Ensure no old ITS dot gradient or floating pill remains
    expect(container.querySelector("#tnlDotGrad")).toBeNull();
  });

  it("uses an immediate back-to-top action when reduced motion is preferred", () => {
    const matchMedia = vi.spyOn(window, "matchMedia").mockImplementation((query) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    try {
      renderWithProviders(<SmoothScrollProvider><SiteFooter /></SmoothScrollProvider>);
      screen.getByTestId("footer-back-to-top-button").click();
      expect(window.scrollTo).toHaveBeenCalledWith({ top: 0, behavior: "instant" });
    } finally {
      matchMedia.mockRestore();
    }
  });

  it("MobileRegistrationBar renders call-to-action bar on public routes", () => {
    renderWithProviders(<MobileRegistrationBar />, { route: "/" });
    expect(screen.getByTestId("mobile-reg-cta-button")).toBeInTheDocument();
  });
});
