import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { MemberSections } from "@/components/site/MemberSections";
import MemberPage from "@/pages/MemberPage";
import { renderWithProviders } from "./test-utils";

const { members } = vi.hoisted(() => ({ members: [
  { id: "a1", name: "CMS Assistant", role: "assistant", status: "active", batch: "2027", division: "Research", position: "head", order: 0, nim: "PRIVATE-NIM", email_personal: "private@example.org", show_nim: false, show_personal_email: false, email_public: "public@example.org", social: {} },
  { id: "a2", name: "Unbatched Assistant", role: "assistant", status: "active", division: "Future Division", order: 1, social: {} },
] }));
vi.mock("@/lib/hooks", async (original) => ({
  ...await original<typeof import("@/lib/hooks")>(),
  useMembers: vi.fn(() => ({ data: members, isLoading: false })),
  usePublications: vi.fn(() => ({ data: [], isLoading: false })),
  usePage: vi.fn(() => ({ data: { blocks: [{ id: "cms-copy", type: "rich_text", props: { body: "CMS member introduction" } }] }, isLoading: false })),
}));

describe("CMS member editorial directory", () => {
  it("derives the active batch label from CMS records rather than a fixed year", () => {
    renderWithProviders(<MemberSections />);
    expect(screen.queryByText("Batch 2023 / 2024")).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Batch 2027" })).toBeInTheDocument();
    expect(screen.getByText("Unbatched Assistant")).toBeInTheDocument();
  });
  it("keeps contact links outside profile buttons and private fields out of the profile", () => {
    renderWithProviders(<MemberSections />);
    const card = screen.getByTestId("assistant-card-a1");
    expect(card.tagName).toBe("ARTICLE");
    expect(within(card).getByRole("link", { name: "Email CMS Assistant" }).closest("button")).toBeNull();
    fireEvent.click(within(card).getByRole("button", { name: /CMS Assistant/ }));
    const modal = screen.getByRole("dialog");
    expect(within(modal).queryByText("PRIVATE-NIM")).not.toBeInTheDocument();
    expect(within(modal).queryByText("private@example.org")).not.toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("adds a scoped editorial surface without bypassing the CMS member page", () => {
    const { container } = renderWithProviders(<MemberPage />);
    expect(container.querySelector(".member-editorial")).toBeInTheDocument();
    expect(screen.getByTestId("member-page")).toBeInTheDocument();
  });
});
