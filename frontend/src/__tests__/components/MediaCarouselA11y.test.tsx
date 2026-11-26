import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { FadeCarousel, ImageLightboxModal } from "@/components/site/MediaCarousel";
import { STRINGS } from "@/lib/i18n/i18n";
import { renderWithProviders } from "../utils/test-utils";

const images = [
  { url: "/a.jpg", alt: "First photo", caption: "A" },
  { url: "/b.jpg", alt: "Second photo", caption: "B" },
];

function setLocale(locale: "en" | "id") {
  window.localStorage.setItem("tnl-locale", locale);
}

describe("MediaCarousel accessibility", () => {
  it("keeps localized, always-visible 44px controls and real slide buttons", () => {
    setLocale("id");
    const onImageClick = vi.fn();
    const { container } = renderWithProviders(
      <FadeCarousel images={images} onImageClick={onImageClick} intervalMs={100000} />,
    );

    const prev = screen.getByRole("button", { name: STRINGS.id.carousel_previous });
    const next = screen.getByRole("button", { name: STRINGS.id.carousel_next });
    expect(prev).toHaveClass("h-11", "w-11");
    expect(next).toHaveClass("h-11", "w-11");
    expect(prev.className).not.toContain("opacity-0");
    expect(next.className).not.toContain("opacity-0");

    const dots = screen.getAllByRole("button", { name: `${STRINGS.id.carousel_slide} 1` })
        .filter((button) => button.classList.contains("tnl-carousel-control"));
    expect(dots.length).toBeGreaterThan(0);
    expect(dots[0]).toHaveClass("h-11", "w-11");
    expect(dots[0].className).toContain("focus-visible:outline");

    const slide = screen.getByAltText("First photo").closest("button");
    expect(slide).not.toBeNull();
    fireEvent.click(slide!);
    expect(onImageClick).toHaveBeenCalledWith(0);

    expect(screen.getByRole("button", { name: STRINGS.id.carousel_zoom_in })).toBeInTheDocument();
    expect(container.innerHTML).not.toContain("#111613");
    expect(container.innerHTML).not.toContain("#C4B393");
  });

  it("localizes all lightbox controls and removes raw colours", () => {
    setLocale("id");
    const onClose = vi.fn();
    const { container } = renderWithProviders(<ImageLightboxModal images={images} onClose={onClose} />);

    expect(screen.getByRole("dialog")).toHaveAccessibleName(STRINGS.id.carousel_lightbox);
    for (const key of [
      "carousel_previous", "carousel_next", "carousel_zoom_in", "carousel_close",
    ] as const) {
      expect(screen.getByRole("button", { name: STRINGS.id[key] })).toBeInTheDocument();
    }
    for (const button of screen.getAllByRole("button")) {
      if (button.getAttribute("aria-label")) {
        expect(button.className).toContain("focus-visible:outline");
      }
    }
    expect(container.innerHTML).not.toContain("#C4B393");
  });
});
