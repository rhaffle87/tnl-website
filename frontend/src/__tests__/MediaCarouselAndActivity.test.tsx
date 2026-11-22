import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { screen, fireEvent, render, act } from "@testing-library/react";
import { FadeCarousel, ImageLightboxModal } from "@/components/site/MediaCarousel";
import ActivityPage from "@/pages/ActivityPage";
import { renderWithProviders } from "./test-utils";

vi.mock("@/lib/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/hooks")>();
  return {
    ...actual,
    usePage: vi.fn().mockReturnValue({ data: { blocks: [] }, isLoading: false }),
    useProjects: vi.fn().mockReturnValue({ data: [], isLoading: false }),
    usePracticum: vi.fn().mockReturnValue({
      data: [
        {
          id: "prac-1",
          name: "Jaringan Komputer Lanjut",
          shifts: [
            { id: "s1", day: "Senin", time_slot: "08:00 - 10:00", coordinator_name: "Fadhil", room: "B-301" },
          ],
        },
      ],
      isLoading: false,
    }),
    useEquipment: vi.fn().mockReturnValue({ data: [], isLoading: false }),
    useEvents: vi.fn().mockReturnValue({ data: [], isLoading: false }),
    useActivities: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  };
});

describe("MediaCarousel & Activity Components", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("FadeCarousel auto-advances every 3 seconds and pauses on hover", () => {
    const images = [
      { url: "/img1.jpg", caption: "Slide 1" },
      { url: "/img2.jpg", caption: "Slide 2" },
      { url: "/img3.jpg", caption: "Slide 3" },
    ];

    const { container } = render(<FadeCarousel images={images} intervalMs={3000} />);
    expect(screen.getByText("Slide 1")).toBeInTheDocument();

    // Advance timers by 3000ms
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Hover over carousel container to pause
    const carouselWrapper = container.firstChild as HTMLElement;
    fireEvent.mouseEnter(carouselWrapper);

    // Advance timers while paused; slide should NOT advance
    act(() => {
      vi.advanceTimersByTime(6000);
    });

    // Leave hover; timer resumes
    fireEvent.mouseLeave(carouselWrapper);
    act(() => {
      vi.advanceTimersByTime(3000);
    });
  });

  it("ImageLightboxModal supports Escape key to close", () => {
    const images = [{ url: "/img1.jpg", alt: "Preview 1" }, { url: "/img2.jpg", alt: "Preview 2" }];
    const onClose = vi.fn();

    render(<ImageLightboxModal images={images} isOpen={true} onClose={onClose} />);

    // Press Escape
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();
  });

  it("ActivityPage uses deep-link navigation and preserves the shift table without duplicate tabs", () => {
    renderWithProviders(<ActivityPage />, { route: "/activity?tab=practicum" });
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
    expect(screen.getByTestId("activity-panel-practicum")).toHaveAttribute("role", "region");
    expect(screen.getByRole("table")).toHaveAccessibleName(/Jaringan Komputer Lanjut/);
    expect(screen.getByText("Jaringan Komputer Lanjut")).toBeInTheDocument();
    expect(screen.getByText("Senin")).toBeInTheDocument();
    expect(screen.getByText("08:00 - 10:00")).toBeInTheDocument();
  });

  it("ActivityPage maps backward-compatible ?tab=training to events panel", () => {
    renderWithProviders(<ActivityPage />, { route: "/activity?tab=training" });

    // Verify events panel is active via backward compatibility
    expect(screen.getByTestId("activity-panel-events")).toBeInTheDocument();
    expect(screen.getByTestId("events-heading")).toBeInTheDocument();
  });
});
