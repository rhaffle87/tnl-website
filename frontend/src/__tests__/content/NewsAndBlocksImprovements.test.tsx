import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";
import { BlockRenderer } from "@/components/site/Blocks";
import { NewsArticlePage } from "@/pages/NewsPage";
import { CmsPage } from "@/pages/Home";
import { ApiError, apiUrl } from "@/lib/api/api";
import { renderWithProviders } from "./test-utils";

vi.mock("@/components/site/MemberSections", () => ({ MemberSections: () => null, MemberSectionsPlaceholder: () => null }));
vi.mock("@/lib/api/hooks", () => ({
  usePage: vi.fn(),
  usePagePreview: vi.fn(),
  usePost: vi.fn(),
  usePosts: vi.fn(),
  usePublicCollection: vi.fn(),
  useSettings: vi.fn(),
  useStats: vi.fn(),
  useMembers: vi.fn(),
  usePartners: vi.fn(),
}));
// The article 404 surface is owned by another agent: honour the `as` prop contract.
vi.mock("@/components/site/Primitives", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/components/site/Primitives")>();
  return {
    ...actual,
    EmptyState: ({ title, body, testId, icon, as }: {
      title: string; body: string; testId?: string; icon?: React.ReactNode; as?: "h1" | "h3";
    }) => as === "h1"
      ? <h1 className="tnl-h1" data-testid={testId}>{title}</h1>
      : <actual.EmptyState title={title} body={body} testId={testId} icon={icon} />,
  };
});
import { usePage, usePagePreview, usePost, usePosts, usePublicCollection, useSettings, useStats, useMembers, usePartners } from "@/lib/api/hooks";

const article = {
  id: "one", slug: "network", title: "Network research", title_id: "Riset jaringan",
  category: "Community Service", body: "<p>CMS article body</p>", body_id: "<p>Isi artikel CMS</p>",
  published_at: "2026-01-12T10:00:00Z", author: "Lab team", tags: ["network"],
  related: [{ id: "two", slug: "next", title: "Next article", category: "Research" }],
};

function renderArticle(route = "/news/network") {
  return renderWithProviders(<Routes><Route path="/news/:slug" element={<NewsArticlePage />} /></Routes>, { route });
}

describe("news and block content improvements", () => {
  beforeEach(() => {
    localStorage.setItem("tnl-locale", "en");
    vi.mocked(useSettings).mockReturnValue({ data: { contact: { email: "cms@example.edu" } } } as never);
    vi.mocked(usePage).mockReturnValue({ data: { blocks: [] }, isLoading: false } as never);
    vi.mocked(usePagePreview).mockReturnValue({ data: undefined, isLoading: false, isError: false } as never);
    vi.mocked(usePost).mockReturnValue({ data: article, isLoading: false } as never);
    vi.mocked(usePosts).mockReturnValue({
      data: {
        items: [{ ...article, cover_url: "/cover.webp" }], total: 1,
        categories: ["Research", "Community Service", "Training", "Announcement", "Quantum & Optics"],
      },
      isLoading: false, isFetching: false,
    } as never);
    vi.mocked(usePublicCollection).mockReturnValue({ data: undefined, isLoading: false, isError: false } as never);
    vi.mocked(useStats).mockReturnValue({ data: { lecturers: 2, assistants: 4, research_tracks: 3, room: "B-301" } } as never);
    vi.mocked(useMembers).mockReturnValue({ data: [], isLoading: false } as never);
    vi.mocked(usePartners).mockReturnValue({ data: [], isLoading: false } as never);
  });
  afterEach(() => cleanup());

  it("localizes canonical category labels while keeping raw values for filtering", () => {
    localStorage.setItem("tnl-locale", "id");
    renderWithProviders(<BlockRenderer blocks={[{ id: "feed", type: "news_feed", hidden: false, props: { show_filters: true, count: 3 } }]} />);
    expect(screen.getByTestId("news-category-research-button")).toHaveTextContent("Riset");
    expect(screen.getByTestId("news-category-community-service-button")).toHaveTextContent("Pengabdian Masyarakat");
    expect(screen.getByTestId("news-category-training-button")).toHaveTextContent("Pelatihan");
    expect(screen.getByTestId("news-category-announcement-button")).toHaveTextContent("Pengumuman");
    expect(screen.getByTestId("news-category-quantum-optics-button")).toHaveTextContent("Quantum & Optics");
    fireEvent.click(screen.getByTestId("news-category-research-button"));
    expect(usePosts).toHaveBeenLastCalledWith(expect.objectContaining({ category: "Research" }));
  });

  it("paginates with the server total and resets to the first offset on filters", () => {
    vi.mocked(usePosts).mockReturnValue({
      data: { items: [article], total: 7, categories: ["Research"] },
      isLoading: false, isFetching: false, isError: false,
    } as never);
    renderWithProviders(<BlockRenderer blocks={[{ id: "feed", type: "news_feed", hidden: false, props: { show_filters: true, count: 3 } }]} />);
    expect(screen.getByTestId("news-pagination-summary")).toHaveTextContent("Showing 1–3 of 7 articles");
    fireEvent.click(screen.getByTestId("news-next-page"));
    expect(usePosts).toHaveBeenLastCalledWith(expect.objectContaining({ limit: 3, offset: 3 }));
    expect(screen.getByTestId("news-pagination-summary")).toHaveTextContent("Showing 4–6 of 7 articles");
    fireEvent.click(screen.getByTestId("news-category-research-button"));
    expect(usePosts).toHaveBeenLastCalledWith(expect.objectContaining({ category: "Research", offset: 0 }));
  });

  it("distinguishes a failed news request from an empty result and retries it", () => {
    const retry = vi.fn();
    vi.mocked(usePosts).mockReturnValue({
      data: undefined, isLoading: false, isFetching: false, isError: true, refetch: retry,
    } as never);
    renderWithProviders(<BlockRenderer blocks={[{ id: "feed", type: "news_feed", hidden: false, props: { show_filters: true, count: 3 } }]} />);
    expect(screen.getByTestId("news-request-error")).toHaveAttribute("role", "alert");
    expect(screen.queryByTestId("news-empty-state")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("news-request-error-retry"));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("shows a retryable CMS error but keeps an intentional not-found state distinct", () => {
    const retry = vi.fn();
    vi.mocked(usePage).mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new Error("offline"), refetch: retry } as never);
    renderWithProviders(<CmsPage slug="about" testId="cms-about" />);
    fireEvent.click(screen.getByTestId("cms-about-request-error-retry"));
    expect(retry).toHaveBeenCalledOnce();
    expect(screen.queryByTestId("cms-about-empty-state")).not.toBeInTheDocument();

    vi.mocked(usePage).mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new ApiError(404, null) } as never);
    renderWithProviders(<CmsPage slug="unknown" testId="cms-unknown" missing="not-found" />);
    expect(screen.getByTestId("cms-unknown-empty-state")).toBeInTheDocument();
    expect(screen.queryByTestId("cms-unknown-request-error")).not.toBeInTheDocument();
  });

  it("loads preview by the authenticated endpoint only and checks the route slug", () => {
    const draft = { id: "page-1", slug: "draft-page", title: "Draft page", blocks: [] };
    vi.mocked(usePage).mockReturnValue({ data: undefined, isLoading: false, isError: false } as never);
    vi.mocked(usePagePreview).mockReturnValue({ data: draft, isLoading: false, isError: false } as never);
    renderWithProviders(<Routes><Route path="/p/:slug" element={<CmsPage slug="draft-page" testId="cms-preview" />} /></Routes>, { route: "/p/draft-page?preview=page-1" });
    expect(usePage).toHaveBeenLastCalledWith("draft-page", { enabled: false });
    expect(usePagePreview).toHaveBeenLastCalledWith("draft-page", "page-1");
    expect(screen.getByTestId("cms-preview-preview-banner")).toHaveTextContent("Studio preview");
    expect(screen.getByTestId("cms-preview")).toBeInTheDocument();
  });

  it("constructs API URLs under the configured public base path", () => {
    expect(apiUrl("/registrations/event/id", "/lab-tnl/")).toBe("/lab-tnl/api/registrations/event/id");
    expect(apiUrl("certificates/TNL-1/pdf", "/")).toBe("/api/certificates/TNL-1/pdf");
  });

  it("renders custom collection fields as safe content using the selected template", () => {
    vi.mocked(usePublicCollection).mockReturnValue({
      data: {
        definition: {
          id: "collection-1", key: "resources", name: "Resources", template: "list", created_at: "",
          fields: [
            { key: "title", label: "Title", type: "text" },
            { key: "link", label: "Link", type: "url" },
            { key: "description", label: "Description", type: "html" },
          ],
        },
        items: [
          { id: "resource-1", collection_key: "resources", status: "published", created_at: "", updated_at: "", values: {
            title: "Handbook", link: "javascript:alert(1)", description: "<script>alert(1)</script><b>Published description</b>",
          } },
          { id: "resource-draft", collection_key: "resources", status: "draft", created_at: "", updated_at: "", values: { title: "Private draft" } },
        ],
        total: 31,
      },
      isLoading: false, isError: false,
    } as never);
    renderWithProviders(<BlockRenderer blocks={[{ id: "custom-list", type: "collection_list", hidden: false, props: { collection_key: "resources" } }]} />);
    expect(screen.getByTestId("collection-resources-list")).toBeInTheDocument();
    expect(screen.getByText("Handbook")).toBeInTheDocument();
    expect(screen.queryByText("Private draft")).not.toBeInTheDocument();
    expect(screen.getByText("javascript:alert(1)")).not.toHaveAttribute("href");
    expect(screen.getByText("alert(1) Published description")).toBeInTheDocument();
    expect(document.querySelector("script:not([data-tnl-jsonld])")).not.toBeInTheDocument();
    expect(screen.getByText("Showing 1–24 of 31 items")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("collection-resources-next"));
    expect(usePublicCollection).toHaveBeenLastCalledWith("resources", { limit: 24, offset: 24 });
  });

  it("gives every category pill and the location link a 44px minimum hit area", () => {
    renderWithProviders(<BlockRenderer blocks={[
      { id: "feed", type: "news_feed", hidden: false, props: { show_filters: true, count: 3 } },
      { id: "about", type: "about", hidden: false, props: { heading: "About", body: "Body", location: "B-301" } },
    ]} />);
    expect(screen.getByTestId("news-category-all-button")).toHaveClass("min-h-[44px]");
    expect(screen.getByTestId("news-category-research-button")).toHaveClass("min-h-[44px]");
    expect(screen.getByRole("link", { name: /View location/ })).toHaveClass("min-h-[44px]");
  });

  it("shows the localized recovery note rather than a bare dash when stats fail", () => {
    vi.mocked(useStats).mockReturnValue({ isError: true, data: undefined } as never);
    renderWithProviders(<BlockRenderer blocks={[{ id: "stats", type: "stats", hidden: false, props: {} }]} />);
    expect(screen.getByText("Live content is unavailable right now.")).toBeInTheDocument();
    expect(screen.queryAllByText("—")).toHaveLength(0);
  });

  it("reserves space for CMS image block images", () => {
    renderWithProviders(<BlockRenderer blocks={[{ id: "img", type: "image", hidden: false, props: { url: "/lab.webp", alt: "Lab" } }]} />);
    const image = screen.getByRole("img", { name: "Lab" });
    expect(image).toHaveAttribute("width", "1600");
    expect(image).toHaveAttribute("height", "900");
    expect(image.parentElement).toHaveStyle({ aspectRatio: "16 / 9" });
  });

  it("localizes the article category in the Indonesian reading surface", () => {
    localStorage.setItem("tnl-locale", "id");
    renderArticle();
    expect(screen.getByText("Pengabdian Masyarakat")).toBeInTheDocument();
    expect(screen.queryByText("Community Service")).not.toBeInTheDocument();
  });

  it("renders the not-found EmptyState as an h1", () => {
    vi.mocked(usePost).mockReturnValue({ data: undefined, isLoading: false, isError: true, error: new ApiError(404, null) } as never);
    renderArticle("/news/missing");
    expect(screen.getByTestId("article-empty-state").tagName).toBe("H1");
  });

  it("makes the cover zoom a real button with a localized accessible name", () => {
    vi.mocked(usePost).mockReturnValue({ data: { ...article, cover_url: "/cover.webp" }, isLoading: false } as never);
    renderArticle();
    localStorage.setItem("tnl-locale", "id");
    renderArticle();
    const zoom = screen.getAllByTestId("article-cover-zoom")[1];
    expect(zoom.tagName).toBe("BUTTON");
    expect(zoom).toHaveAttribute("aria-label", "Perbesar gambar sampul artikel");
    fireEvent.click(zoom);
    expect(screen.getByTestId("article-lightbox-img")).toHaveAttribute("src", "/cover.webp");
  });

  it("reserves cover image space before the asset loads", () => {
    vi.mocked(usePost).mockReturnValue({ data: { ...article, cover_url: "/cover.webp" }, isLoading: false } as never);
    renderArticle();
    const cover = screen.getByTestId("article-cover-zoom").querySelector("img")!;
    expect(cover).toHaveAttribute("width", "1600");
    expect(cover).toHaveAttribute("height", "900");
  });

  it("does not place a kicker above the inner hero heading", () => {
    renderWithProviders(<BlockRenderer blocks={[{
      id: "hero", type: "inner_hero", hidden: false,
      props: { eyebrow: "RUANG B-301 • SURABAYA", title: "Kolaborasi", description: "Hubungi kami" },
    }]} />);
    expect(screen.queryByTestId("inner-hero-eyebrow")).not.toBeInTheDocument();
    expect(screen.getByTestId("inner-hero-title")).toHaveTextContent("Kolaborasi");
  });

  it("keeps inline article images clickable and adds keyboard activation with cleanup", () => {
    vi.mocked(usePost).mockReturnValue({
      data: { ...article, body: '<p><img src="/inline.png" alt="Inline diagram" /></p>' }, isLoading: false,
    } as never);
    const { unmount } = renderArticle();
    const inline = screen.getByRole("button", { name: "Inline diagram" });
    expect(inline).toHaveAttribute("tabindex", "0");
    expect(inline).toHaveStyle({ aspectRatio: "16 / 9" });
    fireEvent.keyDown(inline, { key: "Enter" });
    expect(screen.getByTestId("article-lightbox-img").getAttribute("src")).toContain("/inline.png");
    fireEvent.click(screen.getByTestId("article-lightbox-close"));
    const inlineAgain = screen.getByRole("button", { name: "Inline diagram" });
    fireEvent.keyDown(inlineAgain, { key: " " });
    expect(screen.getByTestId("article-lightbox-img")).toBeInTheDocument();
    const body = screen.getByTestId("article-body").parentElement as HTMLElement;
    const removeSpy = vi.spyOn(body, "removeEventListener");
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("keydown", expect.any(Function));
  });
});
