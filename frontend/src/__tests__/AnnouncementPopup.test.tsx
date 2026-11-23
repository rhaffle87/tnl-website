import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { AnnouncementPopup } from "@/components/site/Chrome";
import { useSettings } from "@/lib/hooks";
import { renderWithProviders } from "./test-utils";

vi.mock("@/lib/hooks", () => ({
  useSettings: vi.fn(() => ({ data: undefined })),
  useEvents: vi.fn(() => ({ data: [] })),
}));

type Announcement = Record<string, unknown>;

function showPopup(announcement: Announcement, locale: "en" | "id" = "en") {
  window.localStorage.setItem("tnl-locale", locale);
  vi.mocked(useSettings).mockReturnValue({
    data: { announcement },
  } as unknown as ReturnType<typeof useSettings>);
  renderWithProviders(<AnnouncementPopup />);
  act(() => {
    vi.advanceTimersByTime(1000);
  });
}

describe("AnnouncementPopup CMS content", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("falls back to the legacy register CTA when the CMS has no call to action", () => {
    showPopup({ enabled: true, title: "Cisco training", body: "Room B-301.", version: 1 });
    const cta = screen.getByTestId("announcement-cta-button");
    expect(cta).toHaveTextContent("Register now");
    expect(cta).toHaveAttribute("href", "/activity?tab=events");
  });

  it("renders the CMS call-to-action label and target verbatim", () => {
    showPopup({
      enabled: true,
      title: "Open House is full",
      title_id: "Kuota Open House penuh",
      body: "Thank you for the enthusiasm.",
      body_id: "Terima kasih atas antusiasmenya.",
      cta_label: "Latest news",
      cta_label_id: "Lihat berita",
      url: "/news",
      version: 2,
    });
    const cta = screen.getByTestId("announcement-cta-button");
    expect(cta).toHaveTextContent("Latest news");
    expect(cta).toHaveAttribute("href", "/news");
    expect(screen.getByText("Open House is full")).toBeInTheDocument();
  });

  it("shows the Indonesian copy and label for Indonesian visitors", () => {
    showPopup(
      {
        enabled: true,
        title: "Open House is full",
        title_id: "Kuota Open House penuh",
        body: "Thank you.",
        body_id: "Terima kasih atas antusiasmenya.",
        cta_label: "Latest news",
        cta_label_id: "Lihat berita",
        url: "/news",
        version: 2,
      },
      "id"
    );
    expect(screen.getByText("Kuota Open House penuh")).toBeInTheDocument();
    expect(screen.getByTestId("announcement-cta-button")).toHaveTextContent("Lihat berita");
  });

  it("stays quiet when the announcement is disabled", () => {
    showPopup({ enabled: false, title: "Nothing to see", version: 1 });
    expect(screen.queryByTestId("announcement-popup")).not.toBeInTheDocument();
  });

  it("remembers a dismissal for the current version only", () => {
    showPopup({ enabled: true, title: "First", version: 4 });
    fireEvent.click(screen.getByTestId("announcement-dismiss-button"));
    expect(screen.queryByTestId("announcement-popup")).not.toBeInTheDocument();
    expect(window.localStorage.getItem("tnl-announcement-4")).toBe("dismissed");
  });

  it("does not resurface a dismissed version but does show a newer one", () => {
    window.localStorage.setItem("tnl-announcement-4", "dismissed");
    showPopup({ enabled: true, title: "Same version", version: 4 });
    expect(screen.queryByTestId("announcement-popup")).not.toBeInTheDocument();

    showPopup({ enabled: true, title: "Bumped version", version: 5 });
    expect(screen.getByTestId("announcement-popup")).toBeInTheDocument();
  });
});
