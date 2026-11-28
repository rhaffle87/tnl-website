import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Route, Routes } from "react-router-dom";
import NewsPage, { NewsArticlePage } from "@/pages/NewsPage";
import PublicationsPage from "@/pages/PublicationsPage";
import ContactPage from "@/pages/ContactPage";
import { readFileSync } from "node:fs";
const editorialStyles = readFileSync("src/pages/editorial-content.css", "utf8");
import { renderWithProviders } from "./test-utils";
// Member content is outside these pages; isolate concurrent redesign work.
vi.mock("@/components/site/MemberSections", () => ({ MemberSections: () => null }));
vi.mock("@/lib/api/hooks", () => ({ usePage: vi.fn(), usePagePreview: vi.fn(() => ({ data: undefined, isLoading: false, isError: false })), usePost: vi.fn(), usePosts: vi.fn(), useSettings: vi.fn(), usePublications: vi.fn() }));
import { usePage, usePost, usePosts, useSettings, usePublications } from "@/lib/api/hooks";
const post = { id: "one", slug: "network", title: "Network research", title_id: "Riset jaringan", category: "Research", body: "<p>CMS article body</p>", body_id: "<p>Isi artikel CMS</p>", published_at: "2026-01-12T10:00:00Z", author: "Lab team", tags: ["network"], related: [{ id: "two", slug: "next", title: "Next article", category: "Research" }] };
describe("editorial content pages", () => {
 it("uses theme-aware ink for breadcrumbs and linked-author text on neutral surfaces", () => {
  expect(editorialStyles).toMatch(/\.editorial-content \[data-testid="breadcrumb"\] a\s*\{[^}]*color: var\(--tnl-link\)/);
  expect(editorialStyles).toMatch(/\.editorial-content \.editorial-author-link\s*\{[^}]*color: var\(--tnl-link\)/);
 });
 beforeEach(() => {
  localStorage.setItem("tnl-locale", "en");
  vi.mocked(usePage).mockReturnValue({ data: { blocks: [{ id: "hero", type: "inner_hero", props: { title: "CMS newsroom", title_id: "Berita CMS" } }, { id: "feed", type: "news_feed", props: { heading: "Dispatches", show_filters: true, count: 12 } }] }, isLoading: false } as never);
  vi.mocked(usePost).mockReturnValue({ data: post, isLoading: false } as never);
  vi.mocked(usePosts).mockReturnValue({ data: { items: [post], total: 1, categories: ["Research"] }, isLoading: false } as never);
  vi.mocked(useSettings).mockReturnValue({ data: { contact: { email: "cms@example.edu" } } } as never);
 });
 it("keeps the CMS archive and filters inside the editorial page surface", () => {
  const { container } = renderWithProviders(<NewsPage />);
  expect(container.querySelector(".editorial-news-index")).toBeInTheDocument();
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("CMS newsroom");
  expect(screen.getByTestId("news-card-network")).toHaveAttribute("href", "/news/network");
  fireEvent.click(screen.getByTestId("news-category-research-button"));
  expect(usePosts).toHaveBeenLastCalledWith(expect.objectContaining({ category: "Research" }));
 });
 it("renders publications as a semantic bibliography while retaining combined filters and DOI links", () => {
  vi.mocked(usePublications).mockReturnValue({ data: [{ id: "p1", title: "Cloud testbed", year: 2026, ptype: "Journal", doi: "10.1000/test", linked_members: [{ id: "m1", name: "CMS Author" }] }, { id: "p2", title: "Older proceedings", year: 2025, ptype: "Conference" }], isLoading: false } as never);
  renderWithProviders(<PublicationsPage />);
  expect(screen.getByRole("list", { name: /Publications/i })).toContainElement(screen.getByTestId("publication-p1"));
  expect(screen.getByTestId("publication-link-p1")).toHaveAttribute("href", "https://doi.org/10.1000/test");
  expect(screen.getByTestId("pub-author-link-p1-m1")).toHaveAttribute("href", "/member?highlight=m1");
  fireEvent.change(screen.getByTestId("publications-year-filter"), { target: { value: "2026" } });
  fireEvent.change(screen.getByTestId("publications-type-filter"), { target: { value: "Journal" } });
  expect(screen.queryByTestId("publication-p2")).not.toBeInTheDocument();
  expect(screen.getByTestId("publication-p1")).toBeInTheDocument();
  fireEvent.change(screen.getByTestId("publications-search-input"), { target: { value: "no-match-query" } });
  expect(screen.queryByTestId("publication-p1")).not.toBeInTheDocument();
 });
 it("presents CMS article metadata with a machine-readable date and unboxed reading column", () => {
  const { container } = renderWithProviders(<Routes><Route path="/news/:slug" element={<NewsArticlePage />} /></Routes>, { route: "/news/network" });
  expect(usePost).toHaveBeenCalledWith("network");
  expect(screen.getByTestId("article-date").querySelector("time")).toHaveAttribute("dateTime", post.published_at);
  expect(container.querySelector(".editorial-reading-column")).toContainElement(screen.getByTestId("article-body"));
  expect(screen.getByTestId("article-body").closest(".tnl-card")).toBeNull();
  expect(screen.getByTestId("related-article-next")).toHaveAttribute("href", "/news/next");
 });
 it("exposes contact topics and validation accessibly on the correspondence surface", () => {
  renderWithProviders(<ContactPage />);
  const topic = screen.getByTestId("topic-pill-research");
  fireEvent.click(topic);
  expect(topic).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByTestId("contact-subject-input")).toHaveValue("Research Collaboration");
  expect(screen.getByTestId("official-email-link")).toHaveAttribute("href", "mailto:cms@example.edu");
  fireEvent.submit(screen.getByTestId("contact-form"));
  expect(screen.getByTestId("contact-name-input")).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByTestId("contact-name-input")).toHaveAccessibleDescription("Full name is required.");
  expect(screen.getByTestId("contact-address-card").querySelector("address")).toBeInTheDocument();
 });
 it("preserves the Indonesian CMS article body and title", () => {
  localStorage.setItem("tnl-locale", "id");
  renderWithProviders(<Routes><Route path="/news/:slug" element={<NewsArticlePage />} /></Routes>, { route: "/news/network" });
  expect(screen.getByTestId("article-title")).toHaveTextContent("Riset jaringan");
  expect(screen.getByTestId("article-body")).toHaveTextContent("Isi artikel CMS");
 });
});
