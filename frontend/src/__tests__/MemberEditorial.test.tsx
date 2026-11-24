import { describe, it, expect, vi, afterEach } from "vitest";
import { fireEvent, screen, within, cleanup, waitFor } from "@testing-library/react";
import { MemberSections } from "@/components/site/MemberSections";
import MemberPage from "@/pages/MemberPage";
import { renderWithProviders } from "./test-utils";

const { members } = vi.hoisted(() => ({ members: [
  { id: "a1", photo_url: undefined as string | undefined, name: "CMS Assistant", role: "assistant", status: "active", batch: "2027", division: "Research", position: "head", order: 0, nim: "PRIVATE-NIM", email_personal: "private@example.org", show_nim: false, show_personal_email: false, email_public: "public@example.org", social: {} },
  { id: "a2", name: "Unbatched Assistant", role: "assistant", status: "active", division: "Future Division", order: 1, social: {} },
] }));
vi.mock("@/lib/hooks", async (original) => ({
  ...await original<typeof import("@/lib/hooks")>(),
  useMembers: vi.fn(() => ({ data: members, isLoading: false })),
  usePublications: vi.fn(() => ({ data: [], isLoading: false })),
  usePage: vi.fn(() => ({ data: { blocks: [{ id: "cms-copy", type: "rich_text", props: { body: "CMS member introduction" } }] }, isLoading: false })),
}));

describe("CMS member editorial directory", () => {
  it("replaces failed CMS portraits with the existing accessible fallback", () => {
    members[0].photo_url = "https://example.org/missing-portrait.jpg";
    renderWithProviders(<MemberSections />);
    const card = screen.getByTestId("assistant-card-a1");
    fireEvent.error(within(card).getByRole("img"));
    expect(within(card).queryByRole("img")).not.toBeInTheDocument();
    expect(within(card).getByLabelText("Photo pending for CMS Assistant")).toBeInTheDocument();
    members[0].photo_url = undefined;
  });
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

  describe("modal", () => {
    afterEach(() => {
      cleanup();
      document.body.style.overflow = "";
    });

    const openModal = async () => {
      cleanup();
      renderWithProviders(<MemberSections />);
      const trigger = within(screen.getByTestId("assistant-card-a1")).getByRole("button", { name: /CMS Assistant/ });
      trigger.focus();
      fireEvent.click(trigger);
      // Motion mounts the dialog in an effect — never assume it is synchronously present.
      return await screen.findByRole("dialog");
    };

    it("uses a compact identity header and a single scrollable body", async () => {
      const modal = await openModal();
      const header = within(modal).getByTestId("member-profile-header");
      const body = within(modal).getByTestId("member-profile-body");
      // Everything focusable lives inside header or body — no separate panes.
      expect(within(header).getByTestId("member-modal-close-button")).toBeInTheDocument();
      expect(within(header).getByText("CMS Assistant")).toBeInTheDocument();
      expect(within(modal).getAllByText(/CMS Assistant/).length).toBeGreaterThan(0);
      expect(body).toHaveAttribute("data-lenis-prevent");
      expect(body).toHaveAttribute("tabindex", "0");
    });

    it("locks body scroll while open and restores it on close", async () => {
      document.body.style.overflow = "";
      await openModal();
      expect(document.body.style.overflow).toBe("hidden");
      fireEvent.keyDown(window, { key: "Escape" });
      expect(document.body.style.overflow).toBe("");
    });

    it("moves focus into the dialog on open and back to the trigger on close", async () => {
      const modal = await openModal();
      const close = within(modal).getByTestId("member-modal-close-button");
      await waitFor(() => expect(close).toHaveFocus());
      fireEvent.keyDown(window, { key: "Escape" });
      await waitFor(() => expect(close).not.toHaveFocus());
      await waitFor(() =>
        expect(within(screen.getByTestId("assistant-card-a1")).getByRole("button", { name: /CMS Assistant/ })).toHaveFocus(),
      );
    });

    it("shows gated private fields only when the CMS flags allow them", async () => {
      const modal = await openModal();
      expect(within(modal).queryByText(/NRP/)).not.toBeInTheDocument();
      expect(within(modal).queryByText("private@example.org")).not.toBeInTheDocument();
      fireEvent.keyDown(window, { key: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      members[0].show_nim = true;
      members[0].show_personal_email = true;
      try {
        const reopened = await openModal();
        expect(within(reopened).getByText(/NRP: PRIVATE-NIM/)).toBeInTheDocument();
        expect(within(reopened).getByText("private@example.org")).toBeInTheDocument();
      } finally {
        members[0].show_nim = false;
        members[0].show_personal_email = false;
      }
    });

    it("renders the social links as an accessible section", async () => {
      members[0].social = { github: "https://github.com/cms" };
      try {
        const modal = await openModal();
        const socials = within(modal).getByTestId("member-socials-a1");
        expect(within(socials).getByRole("link", { name: "GitHub" })).toBeInTheDocument();
      } finally {
        members[0].social = {};
      }
    });
  });
});
