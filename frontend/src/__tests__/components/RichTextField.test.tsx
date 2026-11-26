import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { RichTextField, normalizeHtml, isSafeHref, countWords } from "@/components/admin/editor";
import { renderWithProviders } from "./test-utils";

// The real picker talks to the media API; the editor only needs the contract.
vi.mock("@/components/admin/media", () => ({
  MediaPickerModal: ({ open, onSelect, defaultFolder }: { open: boolean; defaultFolder?: string; onSelect: (items: unknown[]) => void }) =>
    open ? (
      <div data-testid="media-picker-stub" data-folder={defaultFolder || ""}>
        <button
          type="button"
          data-testid="media-picker-stub-pick"
          onClick={() =>
            onSelect([
              {
                id: "media-1",
                url: "https://cdn.labtnl.site/posts/router.png",
                webp_url: "https://cdn.labtnl.site/posts/router.webp",
                alt: "Router rack",
                original_name: "router.png",
              },
            ])
          }
        >
          pick
        </button>
      </div>
    ) : null,
}));

describe("rich text helpers", () => {
  it("wraps legacy plain text in paragraphs and leaves real HTML alone", () => {
    expect(normalizeHtml("First line\n\nSecond line")).toBe("<p>First line</p><p>Second line</p>");
    expect(normalizeHtml("Line A\nLine B")).toBe("<p>Line A<br>Line B</p>");
    expect(normalizeHtml("<p>Already <strong>html</strong></p>")).toBe("<p>Already <strong>html</strong></p>");
    expect(normalizeHtml("")).toBe("");
    expect(normalizeHtml("a < b")).toBe("<p>a &lt; b</p>");
  });

  it("only accepts link targets the backend sanitizer keeps", () => {
    for (const ok of ["https://labtnl.site/news", "http://x.test", "/news", "mailto:lab@its.ac.id"]) {
      expect(isSafeHref(ok), ok).toBe(true);
    }
    for (const bad of ["javascript:alert(1)", "JavaScript:alert(1)", "//evil.test", "data:text/html,x", ""]) {
      expect(isSafeHref(bad), bad).toBe(false);
    }
  });

  it("counts words from markup, not tags", () => {
    expect(countWords("<p>Hello <strong>brave</strong> world</p>")).toBe(3);
    expect(countWords("")).toBe(0);
  });
});

describe("RichTextField", () => {
  const renderField = (value: string, onChange = vi.fn()) =>
    renderWithProviders(<RichTextField value={value} onChange={onChange} testId="rich-text" defaultFolder="posts" />);

  it("opens existing HTML in write mode and switches to preview and raw HTML", async () => {
    renderField("<p>Hello <strong>world</strong></p>");

    const editor = await screen.findByTestId("rich-text-editor");
    expect(editor.textContent).toContain("Hello");
    expect(editor.textContent).toContain("world");
    expect(screen.getByTestId("rich-text-word-count").textContent).toContain("2 words");

    fireEvent.click(screen.getByTestId("rich-text-mode-preview"));
    const preview = screen.getByTestId("rich-text-preview");
    expect(preview.className).toContain("tnl-prose");
    expect(preview.innerHTML).toContain("<strong>world</strong>");

    fireEvent.click(screen.getByTestId("rich-text-mode-html"));
    const source = screen.getByTestId("rich-text-html-source") as HTMLTextAreaElement;
    expect(source.value).toContain("<p>Hello");
  });

  it("emits edited raw HTML from the escape-hatch textarea", async () => {
    const onChange = vi.fn();
    renderField("<p>Old</p>", onChange);

    fireEvent.click(await screen.findByTestId("rich-text-mode-html"));
    fireEvent.change(screen.getByTestId("rich-text-html-source"), { target: { value: "<p>New copy</p>" } });
    expect(onChange).toHaveBeenCalledWith("<p>New copy</p>");
  });

  it("rejects javascript: links and accepts safe ones", async () => {
    renderField("<p>Body</p>");

    fireEvent.click(await screen.findByTestId("rich-text-link"));
    const input = screen.getByTestId("rich-text-link-input");
    fireEvent.change(input, { target: { value: "javascript:alert(1)" } });
    fireEvent.click(screen.getByTestId("rich-text-link-apply"));
    expect(screen.getByTestId("rich-text-link-error")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "/news" } });
    fireEvent.click(screen.getByTestId("rich-text-link-apply"));
    await waitFor(() => expect(screen.queryByTestId("rich-text-link-error")).not.toBeInTheDocument());
  });

  it("inserts a media library image at the cursor", async () => {
    renderField("<p>Body</p>");

    fireEvent.click(await screen.findByTestId("rich-text-insert-image"));
    const picker = await screen.findByTestId("media-picker-stub");
    expect(picker.getAttribute("data-folder")).toBe("posts");

    fireEvent.click(screen.getByTestId("media-picker-stub-pick"));
    await waitFor(() => expect(screen.queryByTestId("media-picker-stub")).not.toBeInTheDocument());

    fireEvent.click(screen.getByTestId("rich-text-mode-html"));
    const source = screen.getByTestId("rich-text-html-source") as HTMLTextAreaElement;
    expect(source.value).toContain("router.webp");
    expect(source.value).toContain('alt="Router rack"');
  });
});
