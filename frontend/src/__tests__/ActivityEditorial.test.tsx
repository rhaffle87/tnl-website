import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import ActivityPage from "@/pages/ActivityPage";
import { renderWithProviders } from "./test-utils";

vi.mock("@/components/site/Blocks", () => ({ BlockRenderer: ({ blocks }: { blocks: { id: string }[] }) => <>{blocks.map((block) => <p key={block.id}>CMS {block.id}</p>)}</> }));
vi.mock("@/lib/hooks", async (original) => ({
  ...await original<typeof import("@/lib/hooks")>(),
  usePage: vi.fn(() => ({ data: { blocks: [{ id: "intro", type: "inner_hero" }, { id: "notice", type: "rich_text" }] } })),
  useProjects: vi.fn(() => ({ data: [{ id: "rd1", title: "CMS research", kind: "rd" }, { id: "tb1", title: "CMS testbed", is_testbed: true }] })),
  useEquipment: vi.fn(() => ({ data: [{ id: "eq1", name: "CMS radio", category: "sdr", status: "available" }] })),
  usePracticum: vi.fn(() => ({ data: [{ id: "p1", name: "CMS practicum", resources: [{ title: "CMS module", file_url: "/uploads/module.pdf" }], shifts: [{ day: "Monday", time_slot: "09:00", coordinator_name: "CMS coordinator", room: "CMS room" }] }] })),
  useEvents: vi.fn(() => ({ data: [{ id: "event-id", slug: "cms-workshop", title: "CMS workshop", reg_status: "open" }, { id: "event-without-slug", title: "CMS no slug", reg_status: "closed" }] })),
  useActivities: vi.fn(() => ({ data: [{ id: "ac1", title: "CMS assistant activity", category: "academic" }] })),
}));

describe("Activity editorial collection", () => {
  it("links each CMS event to a real detail URL using its slug or public ID", () => {
    renderWithProviders(<ActivityPage />, { route: "/activity?tab=events" });
    expect(screen.getByRole("link", { name: /CMS workshop/ })).toHaveAttribute("href", "/activity/events/cms-workshop");
    expect(screen.getByRole("link", { name: /CMS no slug/ })).toHaveAttribute("href", "/activity/events/event-without-slug");
    expect(screen.getByTestId("event-register-button-cms-workshop")).toBeEnabled();
    expect(screen.getByTestId("event-register-button-event-without-slug")).toBeDisabled();
  });
  it("retains authored CMS content and gives the four tabs labelled panels", () => {
    renderWithProviders(<ActivityPage />);
    expect(screen.getByText("CMS notice")).toBeInTheDocument();
    expect(screen.getByText("CMS research")).toBeInTheDocument();
    expect(screen.getByText("CMS testbed")).toBeInTheDocument();
    expect(screen.getByText("CMS radio")).toBeInTheDocument();
    for (const key of ["practicum", "assistant", "events", "rd"]) {
      const tab = screen.getByTestId(`activity-tab-${key}`);
      fireEvent.click(tab);
      expect(tab).toHaveAttribute("aria-controls", `activity-panel-${key}`);
      expect(screen.getByRole("tabpanel")).toHaveAttribute("aria-labelledby", `activity-tab-${key}`);
      if (key === "practicum") {
        expect(screen.getByRole("link", { name: /CMS module/ })).toHaveAttribute("href", "/uploads/module.pdf");
        expect(screen.getByText("CMS coordinator")).toBeInTheDocument();
      }
      if (key === "assistant") expect(screen.getByText("CMS assistant activity")).toBeInTheDocument();
    }
  });
});
