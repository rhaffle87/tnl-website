import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { SiteHeader, SiteFooter, SiteCollaborationBand, MobileRegistrationBar } from "@/components/site/Chrome";
import { renderWithProviders } from "./test-utils";

vi.mock("@/lib/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hooks")>();
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

  it("SiteCollaborationBand renders collaboration prompt", () => {
    renderWithProviders(<SiteCollaborationBand show={true} />, { route: "/" });
    expect(screen.getByText(/Tertarik berkolaborasi|Interested in collaborating/i)).toBeInTheDocument();
  });

  it("SiteFooter renders 4 informational columns and single-line LAB TNL SVG watermark", () => {
    const { container } = renderWithProviders(<SiteFooter />, { route: "/" });

    // Verify 4 columns exist (About Lab, Divisions/Research, Quick links, Location/Contact)
    expect(screen.getByText(/Ruang B-301|Room B-301/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Departemen Teknik Elektro|Department of Electrical/i).length).toBeGreaterThan(0);

    // Verify monumental SVG watermark contains LAB TNL in a single SVG text element
    const watermarkText = container.querySelector("svg text");
    expect(watermarkText).toBeInTheDocument();
    expect(watermarkText?.textContent).toContain("LAB TNL");

    // Ensure no old ITS dot gradient or floating pill remains
    expect(container.querySelector("#tnlDotGrad")).toBeNull();
  });

  it("MobileRegistrationBar renders call-to-action bar on public routes", () => {
    renderWithProviders(<MobileRegistrationBar />, { route: "/" });
    expect(screen.getByTestId("mobile-reg-cta-button")).toBeInTheDocument();
  });
});
