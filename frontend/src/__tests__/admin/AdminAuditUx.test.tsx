import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";
import { toast } from "sonner";
import ContentManager from "@/pages/admin/ContentManager";
import { MediaLibrary, UsersPage } from "@/pages/admin/AdminScreens";
import PagesList from "@/pages/admin/PagesList";
import { ConfirmButton, AdminErrorBanner } from "@/pages/admin/AdminUI";
import { AdminSwitch } from "@/components/admin/controls";
import { renderWithProviders } from "./test-utils";

const mocks = vi.hoisted(() => ({
  apiGet: vi.fn(),
  apiDelete: vi.fn(),
  apiPatch: vi.fn(),
  apiPut: vi.fn(),
  apiPost: vi.fn(),
  failContent: false,
  contentPage: 0,
  sameIdUpdate: false,
}));

vi.mock("@/lib/api/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/api")>("@/lib/api/api");
  return {
    ...actual,
    apiGet: mocks.apiGet,
    apiDelete: mocks.apiDelete,
    apiPatch: mocks.apiPatch,
    apiPut: mocks.apiPut,
    apiPost: mocks.apiPost,
  };
});

function contentRows() {
  return [
    { id: "p1", title: "Published post", status: "published", cover_url: "" },
    { id: "d1", title: "Draft post", status: "draft", cover_url: "" },
  ];
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.failContent = false;
  mocks.contentPage = 0;
  mocks.sameIdUpdate = false;
  mocks.apiDelete.mockResolvedValue({ ok: true });
  mocks.apiPatch.mockResolvedValue({ ok: true });
  mocks.apiPost.mockResolvedValue({ ok: true });
  mocks.apiGet.mockImplementation((url: string) => {
    if (url.includes("/admin/content/posts")) {
      if (mocks.failContent) return Promise.reject(new Error("network down"));
      const offset = Number(new URL(url, "http://localhost").searchParams.get("offset") ?? 0);
      if (offset < 50 && mocks.contentPage === 0) {
        return Promise.resolve({ items: [contentRows()[0]], total: 2 });
      }
      if (mocks.sameIdUpdate) {
        return Promise.resolve({ items: [{ ...contentRows()[0], status: "draft" }], total: 2 });
      }
      return Promise.resolve({ items: [contentRows()[1]], total: 2 });
    }
    if (url.includes("/admin/media")) {
      return Promise.resolve({
        items: [{ id: "a1", filename: "cover.png", url: "/api/media-files/a1", kind: "image", size_bytes: 100 }],
        total: 1,
        folders: [],
      });
    }
    if (url.includes("/admin/users")) {
      return Promise.resolve({
        items: [{ id: "u1", name: "Rafli", email: "rafli@its.ac.id", role: "viewer", active: true }],
        total: 1,
      });
    }
    if (url.includes("/admin/pages/p1")) {
      return Promise.resolve({
        id: "p1",
        slug: "about",
        title: "About",
        status: "draft",
        blocks: [{ id: "b1", type: "rich_text", hidden: false, props: { title: "Hello" } }],
      });
    }
    if (url.includes("/admin/pages")) {
      return Promise.resolve({ items: [{ id: "p1", slug: "about", title: "About" }], total: 1 });
    }
    return Promise.resolve({});
  });
});

function renderContentManager() {
  return renderWithProviders(
    <Routes>
      <Route path="/admin/content/:resource" element={<ContentManager />} />
    </Routes>,
    { route: "/admin/content/posts" }
  );
}

describe("admin UX/a11y audit fixes", () => {
  it("shows an alert + retry on fetch error and never shows the empty state", async () => {
    mocks.failContent = true;
    renderContentManager();

    const alert = await screen.findByTestId("content-list-error");
    expect(alert).toHaveAttribute("role", "alert");
    expect(screen.queryByText(/No .* found|No data|Nothing/)).toBeNull();

    mocks.failContent = false;
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getByTestId("content-row-p1")).toBeInTheDocument());
  });

  it("clears bulk selection when the status tab changes so a hidden row cannot be deleted", async () => {
    mocks.contentPage = 0;
    renderContentManager();
    await screen.findByTestId("content-row-p1");

    fireEvent.click(screen.getByTestId("content-select-p1"));
    expect(screen.getByTestId("content-bulk-bar")).toHaveTextContent("1 selected");

    fireEvent.click(screen.getByTestId("content-tab-draft"));
    expect(screen.queryByTestId("content-bulk-bar")).toBeNull();
    expect(screen.queryByTestId("bulk-delete-button")).toBeNull();
    expect(screen.queryByTestId("content-row-p1")).toBeNull();
    expect(mocks.apiDelete).not.toHaveBeenCalled();
  });

  it("offers an explicit clear-filters action with a visible result count", async () => {
    renderContentManager();
    await screen.findByTestId("content-row-p1");

    fireEvent.click(screen.getByTestId("content-tab-draft"));
    fireEvent.change(screen.getByTestId("content-search-input"), { target: { value: "draft" } });
    await waitFor(() => expect(screen.getByTestId("content-search-input")).toHaveValue("draft"));

    fireEvent.click(await screen.findByTestId("content-clear-filters"));
    expect(screen.getByTestId("content-search-input")).toHaveValue("");
    expect(screen.getByTestId("content-tab-all")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("content-count")).toHaveTextContent("1 of 2");
    await waitFor(() => expect(screen.getByTestId("content-row-p1")).toBeInTheDocument());
  });

  it("loads more content pages with a default-English X of Y count", async () => {
    renderContentManager();
    await screen.findByTestId("content-row-p1");
    expect(screen.getByText("1 of 2")).toBeInTheDocument();

    mocks.contentPage = 1;
    fireEvent.click(screen.getByTestId("load-more-content"));
    await waitFor(() => expect(screen.getByTestId("content-row-d1")).toBeInTheDocument());
    expect(screen.getByText("2 of 2")).toBeInTheDocument();
    expect(screen.queryByTestId("load-more-content")).toBeNull();
  });

  it("keeps Load more available when the current status filter has no matches", async () => {
    renderContentManager();
    await screen.findByTestId("content-row-p1");
    fireEvent.click(screen.getByTestId("content-tab-draft"));

    expect(screen.getByTestId("content-empty")).toHaveTextContent("No items match this filter.");
    expect(screen.getByTestId("load-more-content")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("load-more-content"));
    await waitFor(() => expect(screen.getByTestId("content-row-d1")).toBeInTheDocument());
  });

  it("replaces an accumulated row when a later refetch returns its updated version", async () => {
    mocks.sameIdUpdate = true;
    renderContentManager();
    await screen.findByTestId("content-row-p1");
    fireEvent.click(screen.getByTestId("content-tab-draft"));
    fireEvent.click(screen.getByTestId("load-more-content"));

    await waitFor(() => expect(screen.getByTestId("content-status-p1")).toHaveTextContent("Draft"));
    expect(screen.getAllByTestId("content-row-p1")).toHaveLength(1);
  });

  it("refreshes the first page after hiding a row from an accumulated list", async () => {
    let hidden = false;
    const originalGet = mocks.apiGet.getMockImplementation()!;
    mocks.apiPut.mockImplementation(async () => {
      hidden = true;
      return { ...contentRows()[0], status: "draft" };
    });
    mocks.apiGet.mockImplementation((url: string) => {
      if (hidden && url.includes("/admin/content/posts") && url.includes("offset=0")) {
        return Promise.resolve({ items: [{ ...contentRows()[0], status: "draft" }], total: 2 });
      }
      return originalGet(url);
    });
    renderContentManager();
    await screen.findByTestId("content-row-p1");
    fireEvent.click(screen.getByTestId("load-more-content"));
    await screen.findByTestId("content-row-d1");
    fireEvent.click(screen.getByTestId("content-toggle-publish-p1"));

    await waitFor(() => expect(screen.getByTestId("content-status-p1")).toHaveTextContent("Draft"));
    expect(screen.getByTestId("content-toggle-publish-p1")).toHaveTextContent("Publish");
    expect(screen.queryByTestId("content-row-d1")).toBeNull();
  });

  it("ConfirmButton is a real dialog: Escape cancels and double submit is guarded", async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    renderWithProviders(
      <ConfirmButton label="Delete" confirmLabel="Delete it" question="Are you sure?" onConfirm={onConfirm} testId="probe" />
    );

    fireEvent.click(screen.getByTestId("probe"));
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.activeElement).toBe(screen.getByTestId("probe-confirm"));

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(onConfirm).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("probe"));
    const accept = screen.getByTestId("probe-confirm");
    fireEvent.click(accept);
    fireEvent.click(accept);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("renders a generic error banner as an alert with a retry action", () => {
    const onRetry = vi.fn();
    renderWithProviders(<AdminErrorBanner message="Gagal memuat" onRetry={onRetry} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Gagal memuat");
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("associates the AdminSwitch label with its control when an id is provided", () => {
    renderWithProviders(
      <AdminSwitch label="Publish now" checked={false} onCheckedChange={() => {}} id="publish-switch" />
    );
    const control = screen.getByLabelText("Publish now");
    expect(control).toHaveAttribute("id", "publish-switch");
    expect(control).toHaveAttribute("aria-checked", "false");
  });

  it("asks for confirmation before a user access change", async () => {
    renderWithProviders(<UsersPage />);
    await screen.findByTestId("user-row-u1");

    fireEvent.click(screen.getByTestId("user-toggle-u1"));
    expect(screen.getByTestId("confirm-dialog")).toHaveAttribute("role", "dialog");
    expect(screen.getByTestId("confirm-accept")).toBeInTheDocument();
    expect(mocks.apiPatch).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("confirm-cancel"));
    expect(screen.queryByTestId("confirm-dialog")).toBeNull();

    fireEvent.click(screen.getByTestId("user-toggle-u1"));
    fireEvent.click(screen.getByTestId("confirm-accept"));
    await waitFor(() => expect(mocks.apiPatch).toHaveBeenCalledWith("/admin/users/u1", { active: false }));
  });

  it("reports clipboard rejection instead of claiming success", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    const errSpy = vi.spyOn(toast, "error").mockImplementation(() => "" as never);
    const okSpy = vi.spyOn(toast, "success").mockImplementation(() => "" as never);

    renderWithProviders(<MediaLibrary />);
    const copy = await screen.findByTestId("media-copy-a1");
    expect(copy).toHaveAccessibleName("Copy link for cover.png");
    fireEvent.click(copy);

    await waitFor(() => expect(errSpy).toHaveBeenCalledWith("Could not copy the link."));
    expect(okSpy).not.toHaveBeenCalled();
    errSpy.mockRestore();
    okSpy.mockRestore();
  });

  it("paginates the users list with a default-English X of Y count", async () => {
    mocks.apiGet.mockImplementation((url: string) => {
      if (url.includes("/admin/users")) {
        const items = Array.from({ length: 51 }, (_, i) => ({
          id: `u${i}`,
          name: `User ${i}`,
          email: `u${i}@its.ac.id`,
          role: "viewer",
          active: true,
        }));
        return Promise.resolve({ items, total: items.length });
      }
      return Promise.resolve({});
    });

    renderWithProviders(<UsersPage />);
    await screen.findByTestId("user-row-u49");
    expect(screen.getByText("50 of 51")).toBeInTheDocument();
    expect(screen.queryByTestId("user-row-u50")).toBeNull();

    fireEvent.click(screen.getByTestId("load-more-users"));
    await screen.findByTestId("user-row-u50");
    expect(screen.getByText("51 of 51")).toBeInTheDocument();
    expect(screen.queryByTestId("load-more-users")).toBeNull();
  });

  it("shows inline pages-json-error for invalid widget properties JSON", async () => {
    renderWithProviders(<PagesList />);
    fireEvent.click(await screen.findByTestId("page-card-about"));
    await screen.findByTestId("page-builder-about");

    fireEvent.click(screen.getByTestId("block-edit-b1"));
    fireEvent.change(screen.getByLabelText("Widget properties JSON"), { target: { value: "{ broken" } });
    expect(screen.getByTestId("pages-json-error")).toHaveAttribute("role", "alert");
    expect(screen.getByTestId("block-props-save-b1")).toBeDisabled();
  });
});
