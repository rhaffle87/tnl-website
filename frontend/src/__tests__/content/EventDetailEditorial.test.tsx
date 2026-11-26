import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { renderWithProviders } from "./test-utils";
import EventDetailPage from "@/pages/EventDetailPage";
import { useEvent } from "@/lib/api/hooks";

const { state } = vi.hoisted(() => ({ state: { data: { id: "public-id", slug: "cms-event", title: "CMS Event Detail", description: "CMS description", reg_status: "open", modules: [{ title: "CMS session", detail: "Session details" }], contacts: [{ name: "CMS contact", email: "contact@example.org" }], documentation: [{ url: "/uploads/documentation.jpg", alt: "CMS documentation" }], form_fields: [] } as Record<string, unknown> | undefined, isLoading: false, isError: false } }));
vi.mock("@/lib/api/hooks", async (original) => ({ ...await original<typeof import("@/lib/api/hooks")>(), useEvent: vi.fn(() => state) }));
vi.mock("@/components/site/RegistrationDialog", () => ({ RegistrationDialog: ({ event, onClose }: { event: { id: string }; onClose: () => void }) => <div role="dialog" data-event-id={event.id}><button onClick={onClose}>Close registration</button></div> }));

function renderDetail(route = "/activity/events/cms-event") {
  return renderWithProviders(<Routes><Route path="/activity/events/:slug" element={<EventDetailPage />} /></Routes>, { route });
}

describe("CMS event detail route", () => {
  beforeEach(() => { state.isLoading = false; state.isError = false; state.data = { ...state.data, id: "public-id", slug: "cms-event", title: "CMS Event Detail", reg_status: "open" }; });
  it("loads the existing public event hook by route slug and preserves CMS content", () => {
    renderDetail();
    expect(useEvent).toHaveBeenCalledWith("cms-event");
    expect(screen.getByRole("heading", { level: 1, name: "CMS Event Detail" })).toBeInTheDocument();
    expect(screen.getByText("CMS session")).toBeInTheDocument();
    expect(screen.getByAltText("CMS documentation")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /contact@example.org/ })).toHaveAttribute("href", "mailto:contact@example.org");
    expect(screen.getByTestId("event-detail-back")).toHaveAttribute("href", "/activity?tab=events");
    expect(screen.queryByTestId("event-detail-link-cms-event")).not.toBeInTheDocument();
  });
  it("presents dated metadata as a readable definition list with machine-readable dates", () => {
    state.data!.start_date = "2026-12-01";
    state.data!.end_date = "2026-12-03";
    state.data!.location = "B-301";
    const { container } = renderDetail();
    const date = screen.getByTestId("event-date-cms-event");
    expect(date.tagName).toBe("DD");
    expect(date.closest("dl")).toBeInTheDocument();
    expect(date.querySelectorAll("time")).toHaveLength(2);
    expect(date.querySelector("time")).toHaveAttribute("dateTime", "2026-12-01");
    expect(screen.getByText("B-301").tagName).toBe("DD");
    expect(screen.getByText("CMS session").closest("section")).toHaveAccessibleName();
    expect(container.querySelectorAll("h4")).toHaveLength(0);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });
  it("places registration directly after key facts, before the curriculum", () => {
    renderDetail();
    const register = screen.getByTestId("event-register-button-cms-event");
    const module = screen.getByText("CMS session");
    expect(register.compareDocumentPosition(module) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("opens the unchanged registration dialog with the public event ID", () => {
    renderDetail();
    fireEvent.click(screen.getByTestId("event-register-button-cms-event"));
    expect(screen.getByRole("dialog")).toHaveAttribute("data-event-id", "public-id");
    fireEvent.click(screen.getByText("Close registration"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it.each(["closed", "past", "upcoming"]) ("does not open registration for server status %s", (status) => {
    state.data!.reg_status = status;
    renderDetail();
    expect(screen.getByTestId("event-register-button-cms-event")).toBeDisabled();
  });
  it("preserves full/waitlist registration behavior", () => {
    state.data!.reg_status = "full";
    renderDetail();
    fireEvent.click(screen.getByTestId("event-register-button-cms-event"));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("accepts a public event ID for records without a slug", () => {
    renderDetail("/activity/events/public-id");
    expect(useEvent).toHaveBeenCalledWith("public-id");
  });
  it("renders a loading state without stale registration controls", () => {
    state.isLoading = true;
    renderDetail();
    expect(screen.getByTestId("event-detail-loading")).toBeInTheDocument();
    expect(screen.queryByTestId("event-register-button-cms-event")).not.toBeInTheDocument();
  });
  it("renders an unavailable state instead of fabricating an event", () => {
    state.isError = true;
    renderDetail();
    expect(screen.getByTestId("event-detail-unavailable")).toBeInTheDocument();
    expect(screen.queryByTestId("event-register-button-cms-event")).not.toBeInTheDocument();
  });
});
