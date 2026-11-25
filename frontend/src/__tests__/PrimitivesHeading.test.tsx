import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { EmptyState } from "@/components/site/Primitives";
import { renderWithProviders } from "./test-utils";

describe("EmptyState heading level", () => {
  it("renders an h1 when asked to be the page heading", () => {
    renderWithProviders(<EmptyState title="No articles" body="Try again" as="h1" testId="empty-heading" />);
    const empty = screen.getByTestId("empty-heading");
    expect(empty.querySelector("h1")).toHaveTextContent("No articles");
    expect(empty.querySelector("h3")).not.toBeInTheDocument();
  });

  it("defaults to h3 for in-section empty states", () => {
    renderWithProviders(<EmptyState title="No events" body="Try again" testId="empty-default" />);
    const empty = screen.getByTestId("empty-default");
    expect(empty.querySelector("h3")).toHaveTextContent("No events");
  });

  it("supports h2 as well", () => {
    renderWithProviders(<EmptyState title="No members" body="Try again" as="h2" testId="empty-h2" />);
    expect(screen.getByTestId("empty-h2").querySelector("h2")).toHaveTextContent("No members");
  });
});
