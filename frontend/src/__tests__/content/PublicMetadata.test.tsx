import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Link, Route, Routes } from "react-router-dom";
import SiteLayout from "@/components/site/SiteLayout";
import type { LabEvent, PageDoc, Post, SiteSettings } from "@/lib/types/types";
import { renderWithProviders } from "./test-utils";

const state = vi.hoisted(() => ({
  settings: undefined as SiteSettings | undefined,
  posts: {} as Record<string, Post>,
  events: {} as Record<string, LabEvent>,
  pages: {} as Record<string, PageDoc>,
  previews: {} as Record<string, PageDoc>,
}));

vi.mock("@/lib/api/hooks", () => ({
  useSettings: () => ({ data: state.settings }),
  usePost: (slug?: string) => ({ data: slug ? state.posts[slug] : undefined, isLoading: false, isError: false }),
  useEvent: (slug?: string) => ({ data: slug ? state.events[slug] : undefined, isLoading: false, isError: false }),
  usePage: (slug?: string) => ({ data: slug ? state.pages[slug] : undefined, isLoading: false, isError: false }),
  usePagePreview: (_slug?: string, id?: string) => ({ data: id ? state.previews[id] : undefined, isLoading: false, isError: false }),
}));

vi.mock("@/lib/theme/theme", () => ({ useApplyThemeTokens: () => {}, useThemeMode: () => {} }));
vi.mock("@/components/site/Chrome", () => ({
  SiteHeader: () => null,
  SiteFooter: () => null,
  ReadingProgressBar: () => null,
  AnnouncementPopup: () => null,
  MobileRegistrationBar: () => null,
  SiteCollaborationBand: () => null,
}));

function PublicRoutes() {
  return (
    <Routes>
      <Route element={<SiteLayout />}>
        <Route path="/news/:slug" element={<Link to="/news/second">Next article</Link>} />
        <Route path="/activity/events/:slug" element={<p>Event detail</p>} />
        <Route path="/p/:slug" element={<p>CMS detail</p>} />
      </Route>
    </Routes>
  );
}

function meta(selector: string): string | null {
  return document.head.querySelector<HTMLMetaElement>(selector)?.content ?? null;
}

describe("dynamic public metadata", () => {
  beforeEach(() => {
    localStorage.setItem("tnl-locale", "en");
    document.title = "";
    for (const selector of ['meta[name="description"]', 'meta[property^="og:"]', 'meta[name^="twitter:"]', 'meta[name="robots"]', 'link[rel="canonical"]', 'script[data-tnl-jsonld="1"]']) {
      document.head.querySelectorAll(selector).forEach((node) => node.remove());
    }
    document.head.insertAdjacentHTML("beforeend", '<link rel="canonical" href="https://labtnl.site/old-route" />');
    state.settings = {
      id: "settings", site_title: "TNL", site_title_id: "TNL", short_name: "TNL", language_default: "en",
      maintenance_mode: false, contact: { room: "B-301" }, social: {}, seo: { title_template: "%s", default_description: "Default description" },
      focus_areas: [], analytics_snippet: "", announcement: { enabled: false, version: 0 }, retention_days: 30, updated_at: "",
    };
    state.posts = {
      first: { id: "1", slug: "first", title: "First research", title_id: "Riset pertama", excerpt: "First excerpt", excerpt_id: "Ringkasan pertama", body: "", body_id: "", category: "Research", tags: [], status: "published", seo: {}, needs_review: false, issues: [], created_at: "", updated_at: "" },
      second: { id: "2", slug: "second", title: "Second research", title_id: "Riset kedua", excerpt: "Second excerpt", excerpt_id: "Ringkasan kedua", cover_url: "/cover.webp", body: "", body_id: "", category: "Research", tags: [], status: "published", seo: {}, needs_review: false, issues: [], created_at: "", updated_at: "" },
    };
    state.events = {
      workshop: { id: "event-1", slug: "workshop", title: "Network Workshop", title_id: "Lokakarya Jaringan", description: "Workshop details", description_id: "Detail lokakarya", type: "training", poster_urls: [], documentation: [], capacity: 10, price: 0, modules: [], contacts: [], form_fields: [], status: "published", needs_review: false, issues: [], created_at: "", updated_at: "" },
    };
    state.pages = {
      guide: { id: "page-1", slug: "guide", title: "Research Guide", title_id: "Panduan Riset", meta_description: "Custom page description", blocks: [], status: "published", is_system: false, needs_review: false, issues: [], created_at: "", updated_at: "" },
    };
    state.previews = {
      "page-draft": { ...state.pages.guide, title: "Draft Guide", meta_description: "Draft-only description", status: "draft" },
    };
  });

  afterEach(() => {
    document.head.querySelectorAll('[data-tnl-preview="1"]').forEach((node) => node.remove());
  });

  it("updates article metadata after SPA navigation without losing the canonical host", async () => {
    renderWithProviders(<PublicRoutes />, { route: "/news/first" });
    await waitFor(() => expect(document.title).toBe("First research — Kabar Lab TNL ITS"));
    expect(meta('meta[name="description"]')).toBe("First excerpt");
    expect(document.head.querySelector('link[rel="canonical"]')).toHaveAttribute("href", "https://labtnl.site/news/first");

    fireEvent.click(screen.getByRole("link", { name: "Next article" }));
    await waitFor(() => expect(document.title).toBe("Second research — Kabar Lab TNL ITS"));
    expect(meta('meta[property="og:description"]')).toBe("Second excerpt");
    expect(meta('meta[property="og:image"]')).toBe("https://labtnl.site/cover.webp");
    expect(meta('meta[property="og:type"]')).toBe("article");
    expect(meta('meta[property="og:url"]')).toBe("https://labtnl.site/news/second");
  });

  it("uses event and custom page metadata when their route data is available", async () => {
    const { unmount } = renderWithProviders(<PublicRoutes />, { route: "/activity/events/workshop" });
    await waitFor(() => expect(document.title).toBe("Network Workshop — Telecommunication Network Laboratory ITS"));
    expect(meta('meta[name="description"]')).toBe("Workshop details");
    expect(meta('meta[property="og:url"]')).toBe("https://labtnl.site/activity/events/workshop");
    unmount();

    renderWithProviders(<PublicRoutes />, { route: "/p/guide" });
    await waitFor(() => expect(document.title).toBe("Research Guide — Telecommunication Network Laboratory ITS"));
    expect(meta('meta[name="description"]')).toBe("Custom page description");
    expect(meta('meta[property="og:url"]')).toBe("https://labtnl.site/p/guide");
  });

  it("marks protected draft previews noindex and uses only the preview data", async () => {
    renderWithProviders(<PublicRoutes />, { route: "/p/guide?preview=page-draft" });
    await waitFor(() => expect(document.title).toBe("Draft Guide — Telecommunication Network Laboratory ITS"));
    expect(meta('meta[name="description"]')).toBe("Draft-only description");
    expect(meta('meta[name="robots"]')).toBe("noindex,nofollow,noarchive");
    expect(meta('meta[property="og:url"]')).toBe("https://labtnl.site/p/guide");
  });
});
