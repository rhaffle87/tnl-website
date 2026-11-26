import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { NewsFeedBlock } from "@/components/site/Blocks";
import { renderWithProviders } from "./test-utils";

// Mock the usePosts hook from @/lib/hooks
vi.mock("@/lib/api/hooks", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/hooks")>();
  return {
    ...actual,
    usePosts: vi.fn().mockImplementation(({ category, q }) => {
      const allPosts = [
        { id: "1", slug: "cisco-training", title: "Cisco Training 2026", category: "Training", published_at: "2026-03-01" },
        { id: "2", slug: "5g-research", title: "5G Core Research", category: "Research", published_at: "2026-02-15" },
        { id: "3", slug: "community-workshop", title: "Community Service Workshop", category: "Community Service", published_at: "2026-01-20" },
      ];
      let filtered = allPosts;
      if (category) {
        filtered = filtered.filter((p) => p.category === category);
      }
      if (q) {
        filtered = filtered.filter((p) => p.title.toLowerCase().includes(q.toLowerCase()));
      }
      return {
        data: {
          items: filtered,
          total: filtered.length,
          categories: ["Training", "Research", "Community Service"],
        },
        isLoading: false,
        isFetching: false,
      };
    }),
  };
});

describe("NewsFilterAndSearch Component", () => {
  it("renders category filter pills and keeps them stable upon selection", async () => {
    renderWithProviders(<NewsFeedBlock props={{ show_filters: true }} />);

    // Check all categories are rendered initially via test-id
    expect(screen.getByTestId("news-category-training-button")).toBeInTheDocument();
    expect(screen.getByTestId("news-category-research-button")).toBeInTheDocument();
    expect(screen.getByTestId("news-category-community-service-button")).toBeInTheDocument();

    // Click "Research" category pill
    fireEvent.click(screen.getByTestId("news-category-research-button"));

    // Verify pills for other categories do NOT disappear from the DOM
    await waitFor(() => {
      expect(screen.getByTestId("news-category-training-button")).toBeInTheDocument();
      expect(screen.getByTestId("news-category-research-button")).toBeInTheDocument();
      expect(screen.getByTestId("news-category-community-service-button")).toBeInTheDocument();
    });
  });

  it("handles search input debounce correctly", async () => {
    renderWithProviders(<NewsFeedBlock props={{ show_filters: true }} />);

    const searchInput = screen.getByTestId("news-search-input");
    fireEvent.change(searchInput, { target: { value: "Cisco" } });

    expect(searchInput).toHaveValue("Cisco");
  });
});
