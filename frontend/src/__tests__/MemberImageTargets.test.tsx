import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemberSections } from "@/components/site/MemberSections";
import { SignalGallery } from "@/components/site/SignalGallery";
import { renderWithProviders } from "./test-utils";

vi.mock("@/lib/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hooks")>();
  return {
    ...actual,
    useMembers: vi.fn().mockReturnValue({
      data: [
        {
          id: "head-1", name: "Dr. Ir. Wirawan, DEA.", role: "lecturer", status: "active",
          is_head: true, division: "Head of Lab", order: 1,
          photo_url: "/head.webp", email_public: "head@labtnl.site",
          social: { linkedin: "https://linkedin.com/in/head", google_scholar: "https://scholar.google.com/head" },
        },
        {
          id: "asst-1", name: "Fadhil Muhammad", role: "assistant", status: "active",
          batch: "2023", division: "Academics", position: "coordinator", order: 2,
          photo_url: "/assistant.webp", email_public: "fadhil@labtnl.site",
          social: { linkedin: "https://linkedin.com/in/fadhil", instagram: "@fadhil_m" },
          show_nim: false,
        },
      ],
      isLoading: false,
    }),
    usePublications: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  };
});

describe("member and gallery image/link targets", () => {
  afterEach(() => cleanup());

  it("reserves portrait space and enlarges head/assistant profile and email targets", () => {
    renderWithProviders(<MemberSections />);
    expect(screen.getByTestId("head-of-lab-email-link")).toHaveClass("min-h-[44px]");
    expect(screen.getByTestId("member-card-email-asst-1")).toHaveClass("min-h-[44px]");
    expect(screen.getByTestId("member-card-linkedin-asst-1")).toHaveClass("min-h-[44px]");
    expect(screen.getByTestId("member-card-instagram-asst-1")).toHaveClass("min-h-[44px]");
    for (const button of screen.getAllByRole("button", { name: /(View profile|Lihat profil)/i })) {
      expect(button).toHaveClass("min-h-[44px]");
    }
    for (const image of screen.getAllByRole("img")) {
      expect(image).toHaveAttribute("width");
      expect(image).toHaveAttribute("height");
    }
  });

  it("enlarges modal contact links too", async () => {
    renderWithProviders(<MemberSections />);
    fireEvent.click(screen.getByTestId("assistant-card-asst-1"));
    const modal = await screen.findByTestId("member-detail-modal");
    expect(modal).toBeInTheDocument();
    expect(screen.getByTestId("member-modal-email-link")).toHaveClass("min-h-[44px]");
    for (const link of screen.getAllByTestId(/^member-social-/)) {
      expect(link).toHaveClass("min-h-[44px]");
    }
    for (const image of screen.getAllByRole("img")) {
      expect(image).toHaveAttribute("width");
    }
  });

  it("gives gallery items a 44px target and reserves image space", () => {
    renderWithProviders(<SignalGallery props={{ heading: "Gallery", images: [{ url: "/gallery.webp", alt: "Gallery photo" }] }} />);
    expect(screen.getByTestId("gallery-item-0")).toHaveClass("min-h-[44px]");
    const image = screen.getByRole("img", { name: "Gallery photo" });
    expect(image).toHaveAttribute("width", "1600");
    expect(image).toHaveAttribute("height", "900");
    expect(image.parentElement).toHaveStyle({ aspectRatio: "16 / 9" });
  });
});
