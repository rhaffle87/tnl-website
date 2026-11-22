import { describe, it, expect, vi } from "vitest";
import { screen } from "@testing-library/react";
import { BlockRenderer } from "@/components/site/Blocks";
import { renderWithProviders } from "./test-utils";

vi.mock("@/lib/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hooks")>();
  return {
    ...actual,
    usePartners: vi.fn().mockReturnValue({
      data: [
        {
          id: "p1",
          name: "Indosat Ooredoo Hutchison",
          logo_url: "/logo.png",
          published: true,
        },
      ],
      isLoading: false,
    }),
  };
});

describe("Home Blocks & Marquee Components", () => {
  it("HeroBlock renders emblem, .tnl-eyebrow, and .tnl-hero-title", () => {
    const blocks = [
      {
        id: "hero-1",
        type: "hero" as const,
        hidden: false,
        props: {
          badge: "Telecommunication Network Laboratory",
          badge_id: "Laboratorium Jaringan Telekomunikasi",
          title: "Next-Gen Telecommunications & Cloud Infrastructure",
          title_id: "Infrastruktur Cloud & Telekomunikasi Generasi Baru",
          description: "Hands-on research and academic excellence in Room B-301.",
          description_id: "Riset terapan dan keunggulan akademik di Ruang B-301.",
        },
      },
    ];

    const { container } = renderWithProviders(<BlockRenderer blocks={blocks} />);
    const heroSection = screen.getByTestId("block-hero");
    expect(heroSection).toBeInTheDocument();

    // Verify .tnl-eyebrow and .tnl-hero-title typography classes
    const eyebrow = container.querySelector(".tnl-eyebrow");
    expect(eyebrow).toBeInTheDocument();

    const heroTitle = container.querySelector(".tnl-hero-title");
    expect(heroTitle).toBeInTheDocument();
  });

  it("AboutBlock provides readable non-justified editorial copy", () => {
    const blocks = [
      {
        id: "about-1",
        type: "about" as const,
        hidden: false,
        props: {
          badge: "About the Laboratory",
          badge_id: "Tentang Laboratorium",
          title: "Advancing Network Research",
          title_id: "Mendorong Riset Jaringan",
          description: "Established under the Department of Electrical Engineering ITS to foster academic and practical networking mastery.",
          description_id: "Didirikan di bawah Departemen Teknik Elektro ITS untuk mengembangkan penguasaan jaringan secara praktis dan akademis.",
        },
      },
    ];

    const { container } = renderWithProviders(<BlockRenderer blocks={blocks} />);
    const paragraph = container.querySelector(".signal-about-body");
    expect(paragraph).toBeInTheDocument();
    expect(paragraph).not.toHaveClass("text-justify");
  });

  it("PartnersBlock renders partner marquee container without truncation", () => {
    const blocks = [
      {
        id: "partners-1",
        type: "partners" as const,
        hidden: false,
        props: {
          title: "Industry & Academic Partners",
          title_id: "Mitra Industri & Akademik",
        },
      },
    ];

    const { container } = renderWithProviders(<BlockRenderer blocks={blocks} />);
    expect(screen.getByTestId("partners-heading")).toBeInTheDocument();

    // Verify partner name is rendered untruncated (multiple in marquee loop)
    expect(screen.getAllByText("Indosat Ooredoo Hutchison").length).toBeGreaterThan(0);

    // Verify marquee container has overflow-hidden
    const marqueeContainer = container.querySelector(".overflow-hidden");
    expect(marqueeContainer).toBeInTheDocument();
  });
});
