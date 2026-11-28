import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { AnnouncementPopup, MobileRegistrationBar } from "@/components/site/Chrome";
import SiteLayout from "@/components/site/SiteLayout";
import { STRINGS } from "@/lib/i18n/i18n";
import { renderWithProviders } from "../utils/test-utils";

let eventsData: any[] = [];
let settingsData: any = undefined;

vi.mock("@/lib/api/hooks", () => ({
  useSettings: vi.fn(() => ({ data: settingsData })),
  useEvents: vi.fn(() => ({ data: eventsData })),
  usePost: vi.fn(() => ({ data: undefined, isLoading: false, isError: false })),
  useEvent: vi.fn(() => ({ data: undefined, isLoading: false, isError: false })),
  usePage: vi.fn(() => ({ data: undefined, isLoading: false, isError: false })),
  usePagePreview: vi.fn(() => ({ data: undefined, isLoading: false, isError: false })),
}));

function setLocale(locale: "en" | "id") {
  window.localStorage.setItem("tnl-locale", locale);
}

const settings = (announcement: any) => ({
  id: "s1",
  site_title: "Telecommunication Network Laboratory",
  site_title_id: "Laboratorium Jaringan Telekomunikasi",
  short_name: "TNL",
  language_default: "",
  maintenance_mode: false,
  announcement,
  contact: { email: "lab@example.test" },
  seo: { default_description: "desc" },
});

describe("chrome a11y and bilingual strings", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    eventsData = [];
    settingsData = undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("defines the new EN/ID chrome strings", () => {
    const keys = [
      "maintenance_notice",
      "registration_bar_aria",
      "registration_bar_close",
      "contact_consent_label",
      "contact_privacy_link",
      "contact_consent_required",
      "carousel_previous",
      "carousel_next",
      "carousel_slide",
      "carousel_zoom_in",
      "carousel_zoom_out",
      "carousel_close",
      "carousel_lightbox",
      "location_link",
    ];
    for (const key of keys) {
      expect(STRINGS.en, `EN ${key}`).toHaveProperty(key);
      expect(STRINGS.id, `ID ${key}`).toHaveProperty(key);
    }
  });

  it("renders a scrolling, non-modal announcement card that reports open state", () => {
    setLocale("en");
    settingsData = settings({ enabled: true, title: "News", version: 11, style: "card" });
    const onOpenChange = vi.fn();
    renderWithProviders(<AnnouncementPopup onOpenChange={onOpenChange} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });

    const popup = screen.getByTestId("announcement-popup");
    expect(popup).toHaveAttribute("data-announcement-style", "card");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const panel = popup.querySelector(".animate-pop") as HTMLElement;
    expect(panel.className).toMatch(/max-h-\[/);
    expect(panel.className).toContain("overflow-y-auto");
    expect(onOpenChange).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByTestId("announcement-close-button"));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("uses a neutral CTA when the registration target is already closed", () => {
    setLocale("id");
    settingsData = settings({ enabled: true, title: "Open House", version: 12, url: "/activity?tab=events" });
    eventsData = [{
      id: "e1", slug: "open-house-tnl", title: "Open House", type: "event",
      description: "", description_id: "", status: "published", reg_status: "full",
      poster_urls: [], documentation: [], capacity: 0, price: 0,
      modules: [], contacts: [], form_fields: [], needs_review: false, issues: [],
      created_at: "", updated_at: "", version: 1,
    }];
    renderWithProviders(<AnnouncementPopup />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("announcement-cta-button")).toHaveTextContent(STRINGS.id.read_more);
    expect(screen.getByTestId("announcement-cta-button")).not.toHaveTextContent(STRINGS.id.register_now);
  });

  it("keeps the registration CTA when no published event is closed", () => {
    setLocale("en");
    settingsData = settings({ enabled: true, title: "Cisco training", version: 13 });
    eventsData = [{
      id: "e2", slug: "training", title: "Training", type: "event",
      description: "", description_id: "", status: "published", reg_status: "open",
      poster_urls: [], documentation: [], capacity: 0, price: 0,
      modules: [], contacts: [], form_fields: [], needs_review: false, issues: [],
      created_at: "", updated_at: "", version: 1,
    }];
    renderWithProviders(<AnnouncementPopup />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("announcement-cta-button")).toHaveTextContent(STRINGS.en.register_now);
  });

  it("localizes the registration bar labels and gives the close control a 44px target", () => {
    setLocale("en");
    eventsData = [{
      id: "e3", slug: "open-house-tnl", title: "Open House", type: "event",
      description: "", description_id: "", status: "published", reg_status: "open",
      poster_urls: [], documentation: [], capacity: 0, price: 0,
      modules: [], contacts: [], form_fields: [], needs_review: false, issues: [],
      created_at: "", updated_at: "", version: 1,
    }];
    renderWithProviders(<MobileRegistrationBar />);
    expect(screen.getByTestId("mobile-registration-bar")).toHaveAttribute(
      "aria-label", STRINGS.en.registration_bar_aria,
    );
    const close = screen.getByTestId("mobile-reg-close-button");
    expect(close).toHaveAttribute("aria-label", STRINGS.en.registration_bar_close);
    expect(close).toHaveClass("h-11", "w-11");
  });

  it("hides the registration bar while a caller reports the announcement open", () => {
    setLocale("id");
    eventsData = [{
      id: "e4", slug: "open-house-tnl", title: "Open House", type: "event",
      description: "", description_id: "", status: "published", reg_status: "open",
      poster_urls: [], documentation: [], capacity: 0, price: 0,
      modules: [], contacts: [], form_fields: [], needs_review: false, issues: [],
      created_at: "", updated_at: "", version: 1,
    }];
    renderWithProviders(<MobileRegistrationBar announcementOpen />);
    expect(screen.queryByTestId("mobile-registration-bar")).not.toBeInTheDocument();
  });

  it("wires announcement state to the registration bar in the site shell", () => {
    setLocale("en");
    settingsData = settings({ enabled: true, title: "Open House", version: 21, style: "card" });
    eventsData = [{
      id: "e5", slug: "open-house-tnl", title: "Open House", type: "event",
      description: "", description_id: "", status: "published", reg_status: "open",
      poster_urls: [], documentation: [], capacity: 0, price: 0,
      modules: [], contacts: [], form_fields: [], needs_review: false, issues: [],
      created_at: "", updated_at: "", version: 1,
    }];
    renderWithProviders(<SiteLayout />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByTestId("announcement-popup")).toBeInTheDocument();
    expect(screen.queryByTestId("mobile-registration-bar")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("announcement-dismiss-button"));
    expect(screen.getByTestId("mobile-registration-bar")).toBeInTheDocument();
  });

  it("localizes the maintenance notice", () => {
    setLocale("id");
    settingsData = { ...settings({ enabled: false, version: 1 }), maintenance_mode: true };
    renderWithProviders(<SiteLayout />);
    expect(screen.getByTestId("maintenance-banner")).toHaveTextContent(
      STRINGS.id.maintenance_notice,
    );
  });
});
