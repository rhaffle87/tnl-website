import { describe, it, expect, vi } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { MemberSections } from "@/components/site/MemberSections";
import { renderWithProviders } from "./test-utils";

const { member, publications } = vi.hoisted(() => ({
  member: {
    id: "profile-1", name: "Dr. CMS Researcher", role: "lecturer", status: "active",
    position_label: "Senior researcher", division: "Research", batch: "2027", order: 0,
    photo_url: "https://example.org/portrait.jpg", photo_alt: "CMS researcher portrait",
    bio: "A long CMS biography about wireless networks and collaborative research.",
    bio_id: "Biografi peneliti jaringan dari CMS.", expertise: ["Wireless networks", "ICT"],
    nim: "PRIVATE-NIP", email_personal: "private@example.org", show_nim: false, show_personal_email: false,
    email_public: "public@example.org", social: {
      linkedin: "https://linkedin.com/in/cms", instagram: "@cmsresearcher", github: "https://github.com/cms",
      scholar: "https://scholar.google.com/citations?user=cms", sinta: "https://sinta.kemdikbud.go.id/authors/profile/cms",
      scopus: "https://scopus.com/authid/detail.uri?authorId=cms", cv_url: "https://example.org/cv.pdf",
    },
    projects: [{ title: "Machine learning intrusion detection for telecommunication networks", year: "2024–2025", funding: "CMS grant", description: "Full project description from CMS." }],
  },
  publications: [{ id: "pub-1", title: "CMS publication about open networks", year: 2025, venue: "CMS journal", doi: "10.1234/cms" }],
}));
vi.mock("@/lib/api/hooks", async (original) => ({
  ...await original<typeof import("@/lib/api/hooks")>(),
  useMembers: vi.fn(() => ({ data: [member], isLoading: false })),
  usePublications: vi.fn(() => ({ data: publications, isLoading: false })),
}));

function openProfile() {
  const result = renderWithProviders(<MemberSections />);
  const trigger = within(screen.getByTestId("lecturer-card-profile-1")).getByRole("button", { name: /Dr\. CMS Researcher/ });
  trigger.focus();
  fireEvent.click(trigger);
  return { ...result, trigger, modal: screen.getByRole("dialog", { name: member.name }) };
}

describe("Member profile reading surface", () => {
  it("keeps compact identity and close outside the single biography/research scroll body", () => {
    const { modal } = openProfile();
    const header = within(modal).getByTestId("member-profile-header");
    const body = within(modal).getByTestId("member-profile-body");
    expect(header.parentElement).toBe(body.parentElement);
    expect(header).toContainElement(within(modal).getByRole("img", { name: member.photo_alt }));
    expect(header).toContainElement(within(modal).getByRole("heading", { name: member.name }));
    expect(header).toContainElement(within(modal).getByTestId("member-modal-close-button"));
    expect(body).not.toContainElement(header);
    expect(body).toContainElement(within(modal).getByText("Divisi: Research"));
    expect(header).not.toContainElement(within(modal).getByText("Divisi: Research"));
    expect(body).toContainElement(within(modal).getByText(member.bio_id));
    expect(body).toContainElement(within(modal).getByTestId("member-projects-profile-1"));
    expect(body).toContainElement(within(modal).getByTestId("member-publications-profile-1"));
    expect(body).toHaveAttribute("tabindex", "0");
    expect(body).toHaveAttribute("data-lenis-prevent");
  });

  it.each([false, true])("preserves CMS links and obeys both private-field gates (%s)", (visible) => {
    member.show_nim = visible;
    member.show_personal_email = visible;
    try {
      const { modal } = openProfile();
      const profile = within(modal);
      expect(profile.queryByText(/PRIVATE-NIP/)).toBe(visible ? profile.getByText(/PRIVATE-NIP/) : null);
      expect(profile.queryByText(member.email_personal)).toBe(visible ? profile.getByText(member.email_personal) : null);
      expect(profile.getByTestId("member-modal-email-link")).toHaveAttribute("href", `mailto:${member.email_public}`);
      expect(profile.getByTestId("member-modal-linkedin-link")).toHaveAttribute("href", member.social.linkedin);
      expect(profile.getByRole("link", { name: "@cmsresearcher" })).toHaveAttribute("href", "https://instagram.com/cmsresearcher");
      expect(profile.getByTestId("member-modal-cv-link")).toHaveAttribute("href", member.social.cv_url);
      for (const label of ["google-scholar", "sinta", "scopus", "linkedin", "github"]) {
        expect(profile.getByTestId(`member-social-${label}`)).toHaveAttribute("rel", "noopener noreferrer");
      }
      expect(profile.getByText(publications[0].title)).toBeInTheDocument();
      expect(profile.getByRole("link", { name: /DOI/ })).toHaveAttribute("href", `https://doi.org/${publications[0].doi}`);
      expect(profile.getByText(member.projects[0].title)).toBeInTheDocument();
      expect(profile.getByText(member.projects[0].funding)).toBeInTheDocument();
      expect(profile.getByText(member.projects[0].description)).toBeInTheDocument();
      expect(profile.getByText(member.expertise[0])).toBeInTheDocument();
    } finally {
      member.show_nim = false;
      member.show_personal_email = false;
    }
  });

  it("restores the invoking control and body scrolling when closed by button", () => {
    const { modal, trigger } = openProfile();
    fireEvent.click(within(modal).getByTestId("member-modal-close-button"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("");
  });

  it("replaces a failed portrait with a compact named initials fallback", () => {
    const { modal } = openProfile();
    fireEvent.error(within(modal).getByRole("img", { name: member.photo_alt }));
    expect(within(modal).queryByRole("img")).not.toBeInTheDocument();
    expect(within(modal).getByLabelText(`Photo pending for ${member.name}`)).toHaveTextContent("DR");
  });

  it("recovers escaped keyboard focus while retaining wrap, Escape, restoration and body lock", () => {
    document.body.style.overflow = "clip";
    const { modal, trigger } = openProfile();
    const close = within(modal).getByTestId("member-modal-close-button");
    const last = within(modal).getByTestId("member-social-github");
    expect(close).toHaveFocus();
    expect(document.body.style.overflow).toBe("hidden");
    fireEvent.keyDown(close, { key: "Tab", shiftKey: true });
    expect(last).toHaveFocus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(close).toHaveFocus();
    trigger.focus(); // Programmatic focus or browser chrome can leave the dialog.
    const tab = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    window.dispatchEvent(tab);
    expect(tab.defaultPrevented).toBe(true);
    expect(close).toHaveFocus();
    fireEvent.keyDown(close, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(document.body.style.overflow).toBe("clip");
    document.body.style.overflow = "";
  });
});
