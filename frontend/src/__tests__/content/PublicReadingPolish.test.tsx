import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";
import { NewsArticlePage } from "@/pages/NewsPage";
import PublicationsPage from "@/pages/PublicationsPage";
import { renderWithProviders } from "./test-utils";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/site/MemberSections", () => ({ MemberSections: () => null }));
vi.mock("@/lib/api/hooks", () => ({ usePage: vi.fn(), usePost: vi.fn(), usePosts: vi.fn(), useSettings: vi.fn(), usePublications: vi.fn() }));
import { usePage, usePost, usePublications, useSettings } from "@/lib/api/hooks";

const post = {
  id: "one",
  slug: "network",
  title: "Network research",
  title_id: "Riset jaringan",
  category: "Research",
  body: "<p>CMS article body</p>",
  published_at: "2026-01-12T10:00:00Z",
};

const writeText = vi.fn().mockResolvedValue(undefined);

describe("public reading copy affordances", () => {
  beforeEach(() => {
    localStorage.setItem("tnl-locale", "en");
    writeText.mockClear();
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    vi.mocked(usePost).mockReturnValue({ data: post, isLoading: false } as never);
    vi.mocked(useSettings).mockReturnValue({ data: {}, isLoading: false } as never);
    vi.mocked(usePage).mockReturnValue({ data: { blocks: [] }, isLoading: false } as never);
    vi.mocked(usePublications).mockReturnValue({
      data: [
        {
          id: "p1",
          title: "Cloud testbed",
          authors: "Rafli Alif, et al.",
          year: 2026,
          ptype: "Journal",
          venue: "Journal of Networks",
          doi: "10.1000/test",
          url: "https://example.org/paper",
        },
      ],
      isLoading: false,
    } as never);
  });

  it("copies the canonical article link from the news detail page", async () => {
    renderWithProviders(<Routes><Route path="/news/:slug" element={<NewsArticlePage />} /></Routes>, { route: "/news/network" });

    fireEvent.click(screen.getByTestId("article-copy-link-button"));

    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    expect(writeText.mock.calls[0][0]).toContain("/news/network");
  });

  it("copies a formatted citation for a publication", async () => {
    renderWithProviders(<PublicationsPage />);

    fireEvent.click(screen.getByTestId("publication-copy-citation-p1"));

    await vi.waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const citation = writeText.mock.calls[0][0] as string;
    expect(citation).toContain("Cloud testbed");
    expect(citation).toContain("2026");
    expect(citation).toContain("10.1000/test");
  });
});
