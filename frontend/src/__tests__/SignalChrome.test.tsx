import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SiteFooter, SiteHeader } from "@/components/site/Chrome";
import { useSettings } from "@/lib/hooks";
import { renderWithProviders } from "./test-utils";

vi.mock("@/lib/hooks", () => ({
  useSettings: vi.fn(() => ({ data: undefined })),
  useEvents: vi.fn(() => ({ data: [] })),
}));

const dialogPrototype = HTMLDialogElement.prototype;
const dialogMethods = {
  showModal(this: HTMLDialogElement) { this.setAttribute("open", ""); },
  close(this: HTMLDialogElement) { this.removeAttribute("open"); },
};
const nativeDescriptors = Object.getOwnPropertyDescriptors(dialogPrototype);

beforeEach(() => {
  vi.mocked(useSettings).mockReturnValue({ data: undefined } as ReturnType<typeof useSettings>);
  localStorage.setItem("tnl-locale", "en");
  vi.stubGlobal("innerWidth", 1279);
  // jsdom does not implement the browser top layer.
  for (const [name, value] of Object.entries(dialogMethods)) {
    Object.defineProperty(dialogPrototype, name, { configurable: true, value });
  }
});

afterEach(() => {
  cleanup();
  for (const name of Object.keys(dialogMethods)) {
    const descriptor = nativeDescriptors[name];
    if (descriptor) Object.defineProperty(dialogPrototype, name, descriptor);
    else Reflect.deleteProperty(dialogPrototype, name);
  }
  vi.unstubAllGlobals();
  document.body.style.removeProperty("overflow");
});

describe("Signal Editorial chrome", () => {
  it("opens a modal navigation index with contained focus and restores the page on Escape", async () => {
    document.body.style.overflow = "clip";
    const { container } = renderWithProviders(<><SiteHeader /><main><button>Background action</button></main></>);
    const trigger = screen.getByTestId("mobile-menu-button");
    await userEvent.click(trigger);
    const dialog = screen.getByRole("dialog", { name: "Navigation" });
    expect(dialog.tagName).toBe("DIALOG");
    expect(dialog.parentElement).toBe(document.body);
    expect(dialog).toHaveAttribute("open");
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(container).toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("hidden");
    const close = within(dialog).getByRole("button", { name: "Close" });
    expect(close).toHaveFocus();
    await userEvent.tab({ shift: true });
    expect(within(dialog).getByTestId("mobile-join-us-button")).toHaveFocus();
    await userEvent.tab();
    expect(close).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(container).not.toHaveAttribute("inert");
    expect(document.body.style.overflow).toBe("clip");
    expect(trigger).toHaveFocus();
  });

  it("closes at 1280px and moves focus to the visible masthead", async () => {
    document.body.style.setProperty("overflow", "clip", "important");
    const { container } = renderWithProviders(<SiteHeader />, { route: "/news" });
    const preexistingInert = document.body.appendChild(document.createElement("div"));
    preexistingInert.setAttribute("inert", "");
    try {
      const trigger = screen.getByTestId("mobile-menu-button");
      await userEvent.click(trigger);
      fireEvent(window, new Event("resize"));
      expect(screen.getByRole("dialog")).toBeInTheDocument();
      vi.stubGlobal("innerWidth", 1280);
      fireEvent(window, new Event("resize"));
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
      expect(trigger).toHaveAttribute("aria-expanded", "false");
      expect(container).not.toHaveAttribute("inert");
      expect(preexistingInert).toHaveAttribute("inert");
      expect(document.body.style.overflow).toBe("clip");
      expect(document.body.style.getPropertyPriority("overflow")).toBe("important");
      expect(screen.getByTestId("header-logo-link")).toHaveFocus();
      expect(screen.getByTestId("nav-news-link")).toHaveAttribute("aria-current", "page");
    } finally {
      preexistingInert.remove();
    }
  });

  it("closes from the Close button and restores trigger focus", async () => {
    renderWithProviders(<SiteHeader />);
    const trigger = screen.getByTestId("mobile-menu-button");
    await userEvent.click(trigger);
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("keeps the activity deep links and updates current-page state when navigating", async () => {
    renderWithProviders(<SiteHeader />, { route: "/activity?tab=practicum" });
    await userEvent.click(screen.getByTestId("mobile-menu-button"));
    const activity = screen.getByRole("group", { name: "Activity" });
    expect(within(activity).getByTestId("mobile-nav-practicum-link")).toHaveAttribute("aria-current", "page");
    expect(screen.getByTestId("mobile-nav-activity-link")).toHaveAttribute("aria-current", "location");
    expect(within(activity).getByTestId("mobile-nav-rd-link")).toHaveAttribute("href", "/activity?tab=rd");
    await userEvent.click(screen.getByTestId("mobile-nav-rd-link"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("nav-rd-link")).toHaveAttribute("aria-current", "page");
  });

  it("displays the CMS identity and switches its bilingual title", async () => {
    vi.mocked(useSettings).mockReturnValue({
      data: { site_title: "Signal Research Studio", site_title_id: "Studio Riset Sinyal", short_name: "SRS" },
    } as ReturnType<typeof useSettings>);
    renderWithProviders(<SiteHeader />);
    expect(screen.getByTestId("header-logo-link")).toHaveTextContent("Signal Research Studio");
    await userEvent.click(screen.getByTestId("language-toggle-button"));
    expect(screen.getByTestId("header-logo-link")).toHaveTextContent("Studio Riset Sinyal");
  });

  it("links footer research and equipment to the rd tab", () => {
    renderWithProviders(<SiteFooter />);
    expect(screen.getByRole("link", { name: "Research & Testbeds" })).toHaveAttribute("href", "/activity?tab=rd");
    expect(screen.getByRole("link", { name: "Lab Equipment (B-301)" })).toHaveAttribute("href", "/activity?tab=rd#equipment");
  });

  it("retains bilingual CMS identity and contact details in the footer", async () => {
    vi.mocked(useSettings).mockReturnValue({
      data: {
        site_title: "Signal Research Studio",
        site_title_id: "Studio Riset Sinyal",
        contact: { email: "desk@example.test", address: "Building C", address_id: "Gedung C", room: "C" },
        social: { instagram: "https://www.instagram.com/signal_studio/" },
      },
    } as ReturnType<typeof useSettings>);
    renderWithProviders(<><SiteHeader /><SiteFooter /></>);
    const footer = within(screen.getByTestId("site-footer"));
    expect(footer.getByRole("heading", { level: 2, name: "Signal Research Studio" })).toBeInTheDocument();
    expect(footer.getByTestId("footer-address")).toHaveTextContent("Building C");
    expect(footer.getByTestId("footer-email-link")).toHaveAttribute("href", "mailto:desk@example.test");
    expect(footer.getByTestId("footer-instagram-link")).toHaveAttribute("href", "https://www.instagram.com/signal_studio/");
    await userEvent.click(screen.getByTestId("language-toggle-button"));
    expect(footer.getByRole("heading", { level: 2, name: "Studio Riset Sinyal" })).toBeInTheDocument();
    expect(footer.getByTestId("footer-address")).toHaveTextContent("Gedung C");
  });
});
