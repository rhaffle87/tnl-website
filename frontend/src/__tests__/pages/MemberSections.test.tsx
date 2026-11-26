import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { MemberSections } from "@/components/site/MemberSections";
import { renderWithProviders } from "./test-utils";

vi.mock("@/lib/api/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/hooks")>();
  return {
    ...actual,
    useMembers: vi.fn().mockReturnValue({
      data: [
        {
          id: "head-1",
          name: "Dr. Ir. Wirawan, DEA.",
          role: "lecturer",
          status: "active",
          is_head: true,
          division: "Head of Lab",
          quote: "Advancing research in telecommunication networks.",
          order: 1,
        },
        {
          id: "lecturer-1",
          name: "Dr. Endroyono, S.T., M.T.",
          role: "lecturer",
          status: "active",
          is_head: false,
          division: "Lecturer & Researcher",
          projects: [
            {
              title: "5G Open RAN Testbed Deployment",
              title_id: "Pengembangan Testbed 5G Open RAN",
              funder: "DIKTI / Kemendikbudristek",
              year: "2024–2025",
              role: "Principal Investigator",
              role_id: "Ketua Peneliti",
            },
          ],
          order: 2,
        },
        {
          id: "asst-active-1",
          name: "Fadhil Muhammad",
          role: "assistant",
          status: "active",
          batch: "2023",
          division: "Academics",
          position: "coordinator",
          email_public: "fadhil@labtnl.site",
          show_nim: false,
          nim: "5024201001",
          social: {
            linkedin: "https://linkedin.com/in/fadhil-muhammad",
            instagram: "@fadhil_m",
          },
          order: 3,
        },
        {
          id: "asst-alumni-1",
          name: "Budi Santoso",
          role: "assistant",
          status: "alumni",
          batch: "2022",
          division: "Media",
          position: "staff",
          order: 4,
        },
      ],
      isLoading: false,
    }),
    usePublications: vi.fn().mockReturnValue({
      data: [],
      isLoading: false,
    }),
  };
});

describe("MemberSections Component", () => {
  it("renders Head of Lab and toggles between Active and Alumni assistants", async () => {
    renderWithProviders(<MemberSections />);

    // Head of Lab and Active Assistant present
    expect(screen.getByText("Dr. Ir. Wirawan, DEA.")).toBeInTheDocument();
    expect(screen.getByText("Fadhil Muhammad")).toBeInTheDocument();

    // Toggle to Alumni
    const alumniFilter = screen.getByTestId("member-status-alumni-filter");
    fireEvent.click(alumniFilter);

    // Now Alumni assistant is displayed
    await waitFor(() => {
      expect(screen.getByText("Budi Santoso")).toBeInTheDocument();
    });
  });

  it("opens Lecturer modal displaying dedicated Research Projects section", async () => {
    renderWithProviders(<MemberSections />);

    // Click on Lecturer card
    const lecturerCard = screen.getByTestId("lecturer-card-lecturer-1");
    fireEvent.click(lecturerCard);

    // Modal opens
    const modal = await screen.findByTestId("member-detail-modal");
    expect(modal).toBeInTheDocument();

    // Research projects section rendered inside modal
    const projectsSection = screen.getByTestId("member-projects-lecturer-1");
    expect(projectsSection).toBeInTheDocument();
    expect(screen.getByText(/5G Open RAN Testbed Deployment/i)).toBeInTheDocument();
  });

  it("assistant card contact links (email, linkedin, instagram) render and stop propagation", () => {
    renderWithProviders(<MemberSections />);

    const emailLink = screen.getByTestId("member-card-email-asst-active-1");
    const linkedinLink = screen.getByTestId("member-card-linkedin-asst-active-1");
    const igLink = screen.getByTestId("member-card-instagram-asst-active-1");

    expect(emailLink).toBeInTheDocument();
    expect(linkedinLink).toBeInTheDocument();
    expect(igLink).toBeInTheDocument();

    // Click contact links; modal should NOT open
    fireEvent.click(emailLink);
    expect(screen.queryByTestId("member-detail-modal")).toBeNull();

    fireEvent.click(linkedinLink);
    expect(screen.queryByTestId("member-detail-modal")).toBeNull();

    fireEvent.click(igLink);
    expect(screen.queryByTestId("member-detail-modal")).toBeNull();
  });

  it("does not expose NIM/NRP when show_nim is false in modal", async () => {
    renderWithProviders(<MemberSections />);

    const assistantCard = screen.getByTestId("assistant-card-asst-active-1");
    fireEvent.click(assistantCard);

    const modal = await screen.findByTestId("member-detail-modal");
    expect(modal).toBeInTheDocument();
    expect(screen.queryByText(/5024201001/)).toBeNull();
    expect(screen.queryByText(/NRP/)).toBeNull();
  });
});
