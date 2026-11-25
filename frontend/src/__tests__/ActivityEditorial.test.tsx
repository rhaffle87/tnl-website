import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import ActivityPage from "@/pages/ActivityPage";
import { SiteHeader } from "@/components/site/Chrome";
import { renderWithProviders } from "./test-utils";

vi.mock("@/components/site/Blocks", () => ({ BlockRenderer: ({ blocks }: { blocks: { id: string }[] }) => <>{blocks.map((block) => <p key={block.id}>CMS {block.id}</p>)}</> }));
vi.mock("@/lib/hooks", async (original) => ({
  ...await original<typeof import("@/lib/hooks")>(),
  useSettings: vi.fn(() => ({ data: {} })),
  usePage: vi.fn(() => ({ data: { blocks: [{ id: "intro", type: "inner_hero" }, { id: "notice", type: "rich_text" }] } })),
  useProjects: vi.fn(() => ({ data: [{ id: "rd1", title: "CMS research", kind: "rd" }, { id: "tb1", title: "CMS testbed", is_testbed: true }] })),
  useEquipment: vi.fn(() => ({ data: [{ id: "eq1", name: "CMS radio", category: "sdr", status: "available" }] })),
  usePracticum: vi.fn(() => ({ data: [{ id: "p1", name: "CMS practicum", resources: [{ title: "CMS module", file_url: "/uploads/module.pdf" }], shifts: [{ day: "Monday", time_slot: "09:00", coordinator_name: "CMS coordinator", room: "CMS room" }] }] })),
  useEvents: vi.fn(() => ({ data: [{ id: "event-id", slug: "cms-workshop", title: "CMS workshop", reg_status: "open" }, { id: "event-without-slug", title: "CMS no slug", reg_status: "closed" }] })),
  useActivities: vi.fn(() => ({ data: [{ id: "ac1", title: "CMS assistant activity", category: "academic" }] })),
}));

describe("Activity editorial collection", () => {
  it("uses semantic theme tokens rather than fixed colors or dark-green link text", () => {
    for (const file of ["pages/ActivityPage.tsx", "components/site/MemberSections.tsx", "pages/activity-editorial.css"]) {
      const source = readFileSync(`src/${file}`, "utf8");
      expect(source.match(/#[0-9a-fA-F]{3,8}\b|(?:hover:)?text-\[var\(--tnl-green\)\]/), file).toBeNull();
    }
  });
  it("links each CMS event to a real detail URL using its slug or public ID", () => {
    renderWithProviders(<ActivityPage />, { route: "/activity?tab=events" });
    expect(screen.getByRole("link", { name: /CMS workshop/ })).toHaveAttribute("href", "/activity/events/cms-workshop");
    expect(screen.getByRole("link", { name: /CMS no slug/ })).toHaveAttribute("href", "/activity/events/event-without-slug");
    expect(screen.getByTestId("event-register-button-cms-workshop")).toBeEnabled();
    expect(screen.getByTestId("event-register-button-event-without-slug")).toBeDisabled();
  });
  it("keeps the upper header links as the only activity navigation, with no orphan tab semantics", () => {
    renderWithProviders(<><SiteHeader /><ActivityPage /></>, { route: "/activity?tab=rd&source=header" });
    expect(screen.getByText("CMS notice")).toBeInTheDocument();
    expect(screen.getByText("CMS research")).toBeInTheDocument();
    expect(screen.getByText("CMS testbed")).toBeInTheDocument();
    expect(screen.getByText("CMS radio")).toBeInTheDocument();
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByRole("tabpanel")).not.toBeInTheDocument();
    expect(screen.getByTestId("mobile-menu-button")).toHaveAttribute("aria-haspopup", "dialog");
    for (const { navKey, tab } of [
      { navKey: "training", tab: "practicum" },
      { navKey: "assistant", tab: "assistant" },
      { navKey: "events", tab: "events" },
      { navKey: "rd", tab: "rd" },
    ]) {
      const link = screen.getByTestId(`nav-${navKey}-link`);
      fireEvent.click(link);
      expect(link).toHaveAttribute("aria-current", "page");
      expect(link).toHaveTextContent(navKey === "training" ? /^(Training|Pelatihan)$/ : /./);
      const panel = screen.getByTestId(`activity-panel-${tab}`);
      expect(panel).toHaveAttribute("aria-label");
      expect(panel).not.toHaveAttribute("aria-labelledby", `activity-tab-${tab}`);
      expect(screen.queryByTestId(`activity-tab-${tab}`)).not.toBeInTheDocument();
      if (tab === "practicum") {
        expect(screen.getByRole("link", { name: /CMS module/ })).toHaveAttribute("href", "/uploads/module.pdf");
        expect(screen.getByText("CMS coordinator")).toBeInTheDocument();
      }
      if (navKey === "assistant") expect(screen.getByText("CMS assistant activity")).toBeInTheDocument();
    }
  });
  it("keeps equipment deep links and exposes filter selection without a second page navigation", () => {
    renderWithProviders(<ActivityPage />, { route: "/activity?tab=rd#equipment" });
    expect(screen.getByTestId("lab-equipment-section")).toHaveAttribute("id", "equipment");
    const all = screen.getByTestId("equipment-cat-filter-all");
    const server = screen.getByTestId("equipment-cat-filter-server");
    expect(all).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(server);
    expect(server).toHaveAttribute("aria-pressed", "true");
    expect(all).toHaveAttribute("aria-pressed", "false");
    expect(screen.queryByText("CMS radio")).not.toBeInTheDocument();
    fireEvent.click(all);
    expect(screen.getByText("CMS radio")).toBeInTheDocument();
  });
  it("names the training schedule for its CMS module", () => {
    renderWithProviders(<ActivityPage />, { route: "/activity?tab=practicum" });
    expect(screen.getByRole("table")).toHaveAccessibleName(/CMS practicum/);
    expect(screen.getByRole("link", { name: /CMS module/ })).toHaveAttribute("download");
  });
  it.each(["rd", "practicum", "events", "assistant", "training", "unknown"])("supports direct ?tab=%s entry without lower tabs", (key) => {
    renderWithProviders(<ActivityPage />, { route: `/activity?tab=${key}` });
    const active = key === "training" ? "events" : key === "unknown" ? "rd" : key;
    expect(screen.getByTestId(`activity-panel-${active}`)).toHaveAttribute("aria-label");
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
  });
});
