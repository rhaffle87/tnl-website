import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";
import AdminLayout, { NAV_GROUPS } from "@/pages/admin/AdminLayout";
import { renderWithProviders } from "./test-utils";
import type { AuthUser } from "@/lib/types/types";

let mockUser: AuthUser | null = {
  id: "u-superadmin",
  name: "Affandi DEA",
  email: "admin@its.ac.id",
  role: "super_admin",
  divisions: ["media", "event"],
  active: true,
  totp_enabled: false,
  created_at: new Date().toISOString(),
};

vi.mock("@/lib/api/hooks", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/hooks")>("@/lib/api/hooks");
  return {
    ...actual,
    useMe: vi.fn().mockImplementation(() => ({
      data: mockUser,
      isLoading: false,
      isError: !mockUser,
    })),
  };
});

describe("AdminLayout App Shell & Categorized Dual-Scroll Navigation", () => {
  beforeEach(() => {
    mockUser = {
      id: "u-superadmin",
      name: "Affandi DEA",
      email: "admin@its.ac.id",
      role: "super_admin",
      divisions: ["media", "event"],
      active: true,
      totp_enabled: false,
      created_at: new Date().toISOString(),
    };
    localStorage.clear();
  });

  it("renders 100% of defined navigation items for super_admin across all categories", () => {
    renderWithProviders(
      <Routes>
        <Route path="/admin/*" element={<AdminLayout />}>
          <Route path="content/members" element={<div>Members Canvas</div>} />
        </Route>
      </Routes>,
      { route: "/admin/content/members" }
    );

    // Verify root layout and dual scroll architecture test IDs
    expect(screen.getByTestId("admin-root-shell")).toBeInTheDocument();
    expect(screen.getByTestId("admin-sidebar")).toBeInTheDocument();
    expect(screen.getByTestId("admin-sidebar-scroll")).toBeInTheDocument();
    expect(screen.getByTestId("admin-main-scroll")).toBeInTheDocument();
    expect(screen.getByTestId("admin-topbar")).toBeInTheDocument();

    // Verify pinned dashboard link
    expect(screen.getByTestId("admin-nav-dashboard")).toBeInTheDocument();

    // Verify key menu items from each of the 5 categories
    expect(screen.getByTestId("admin-nav-pages")).toBeInTheDocument();
    expect(screen.getByTestId("admin-nav-news")).toBeInTheDocument();
    expect(screen.getByTestId("admin-nav-members")).toBeInTheDocument();
    expect(screen.getByTestId("admin-nav-events-programs")).toBeInTheDocument();
    expect(screen.getByTestId("admin-nav-training")).toBeInTheDocument();
    expect(screen.getByTestId("admin-nav-registrations")).toBeInTheDocument();
    expect(screen.getByTestId("admin-nav-contact-inbox")).toBeInTheDocument();
    expect(screen.getByTestId("admin-nav-media-library")).toBeInTheDocument();
    expect(screen.getByTestId("admin-nav-lab-equipment")).toBeInTheDocument();
    expect(screen.getByTestId("admin-nav-colours-theme")).toBeInTheDocument();
    expect(screen.getByTestId("admin-nav-site-settings")).toBeInTheDocument();
    expect(screen.getByTestId("admin-nav-people-access")).toBeInTheDocument();
    expect(screen.getByTestId("admin-nav-api-keys")).toBeInTheDocument();
    expect(screen.getByTestId("admin-nav-activity-log")).toBeInTheDocument();

    // Verify user profile footer
    expect(screen.getByTestId("admin-current-user")).toHaveTextContent("Affandi DEA");
    expect(screen.getByTestId("admin-sign-out-button")).toBeInTheDocument();
  });

  it("toggles category accordion on click and persists state in localStorage", () => {
    renderWithProviders(
      <Routes>
        <Route path="/admin/*" element={<AdminLayout />}>
          <Route path="" element={<div>Dashboard Canvas</div>} />
        </Route>
      </Routes>,
      { route: "/admin" }
    );

    const toggleBtn = screen.getByTestId("admin-nav-group-toggle-content-editorial");
    expect(toggleBtn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("admin-nav-pages")).toBeInTheDocument();

    // Collapse category
    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByTestId("admin-nav-pages")).not.toBeInTheDocument();

    // Expand category back
    fireEvent.click(toggleBtn);
    expect(toggleBtn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("admin-nav-pages")).toBeInTheDocument();
  });

  it("always keeps the category containing the active route auto-expanded", () => {
    // Manually set content-editorial to collapsed in localStorage
    localStorage.setItem("tnl-admin-nav-collapsed", JSON.stringify({ "content-editorial": true }));

    renderWithProviders(
      <Routes>
        <Route path="/admin/*" element={<AdminLayout />}>
          <Route path="content/posts" element={<div>News Canvas</div>} />
        </Route>
      </Routes>,
      { route: "/admin/content/posts" }
    );

    // Because /admin/content/posts is within content-editorial, it must remain open
    const toggleBtn = screen.getByTestId("admin-nav-group-toggle-content-editorial");
    expect(toggleBtn).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("admin-nav-news")).toBeInTheDocument();
  });

  it("applies RBAC auto-hide: hides categories and links restricted from registrar role", () => {
    mockUser = {
      id: "u-registrar",
      name: "Registrar Staff",
      email: "registrar@its.ac.id",
      role: "registrar",
      divisions: ["event"],
      active: true,
      totp_enabled: false,
      created_at: new Date().toISOString(),
    };

    renderWithProviders(
      <Routes>
        <Route path="/admin/*" element={<AdminLayout />}>
          <Route path="registrations" element={<div>Registrations Canvas</div>} />
        </Route>
      </Routes>,
      { route: "/admin/registrations" }
    );

    // Operations group should be rendered
    expect(screen.getByTestId("admin-nav-group-operations")).toBeInTheDocument();
    expect(screen.getByTestId("admin-nav-registrations")).toBeInTheDocument();

    // Content & Editorial (Pages/Posts/Members) and Media (Media Library) are forbidden to registrar
    expect(screen.queryByTestId("admin-nav-group-content-editorial")).not.toBeInTheDocument();
    expect(screen.queryByTestId("admin-nav-group-media-assets")).not.toBeInTheDocument();

    // Restricted items must not exist in DOM
    expect(screen.queryByTestId("admin-nav-pages")).not.toBeInTheDocument();
    expect(screen.queryByTestId("admin-nav-people-access")).not.toBeInTheDocument();
    expect(screen.queryByTestId("admin-nav-api-keys")).not.toBeInTheDocument();
  });

  it("shows a back control beside the breadcrumb away from the dashboard", () => {
    renderWithProviders(
      <Routes>
        <Route path="/admin/*" element={<AdminLayout />}>
          <Route path="content/news" element={<div>News Canvas</div>} />
        </Route>
      </Routes>,
      { route: "/admin/content/news" }
    );

    const back = screen.getByTestId("admin-back");
    expect(back).toHaveAttribute("aria-label", "Back to previous page");
  });

  it("keeps the dashboard free of a redundant back control", () => {
    renderWithProviders(
      <Routes>
        <Route path="/admin/*" element={<AdminLayout />}>
          <Route path="" element={<div>Dashboard</div>} />
        </Route>
      </Routes>,
      { route: "/admin" }
    );

    expect(screen.queryByTestId("admin-back")).not.toBeInTheDocument();
  });

  it("filters menu items interactively via quick search bar", () => {
    renderWithProviders(
      <Routes>
        <Route path="/admin/*" element={<AdminLayout />}>
          <Route path="" element={<div>Dashboard</div>} />
        </Route>
      </Routes>,
      { route: "/admin" }
    );

    const searchInput = screen.getByTestId("admin-nav-search");
    fireEvent.change(searchInput, { target: { value: "training" } });

    // Only the Training item should survive the filter, and it must not read "Practicum".
    const trainingItem = screen.getByTestId("admin-nav-training");
    expect(trainingItem).toBeInTheDocument();
    expect(trainingItem).toHaveTextContent("Training");
    expect(trainingItem).not.toHaveTextContent("Practicum");
    expect(screen.queryByTestId("admin-nav-pages")).not.toBeInTheDocument();
    expect(screen.queryByTestId("admin-nav-news")).not.toBeInTheDocument();

    // Clear search button restores all items
    const clearBtn = screen.getByTestId("admin-nav-search-clear");
    fireEvent.click(clearBtn);

    expect(screen.getByTestId("admin-nav-pages")).toBeInTheDocument();
    expect(screen.getByTestId("admin-nav-news")).toBeInTheDocument();
  });

  it("handles mobile responsive drawer toggling", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/admin/*" element={<AdminLayout />}>
          <Route path="" element={<div>Dashboard</div>} />
        </Route>
      </Routes>,
      { route: "/admin" }
    );

    // Drawer starts closed
    expect(screen.queryByTestId("admin-mobile-drawer")).not.toBeInTheDocument();

    // Click mobile menu toggle
    const toggleBtn = screen.getByTestId("admin-mobile-menu-toggle");
    fireEvent.click(toggleBtn);

    expect(await screen.findByTestId("admin-mobile-drawer")).toBeInTheDocument();

    // Close via close button
    const closeBtn = screen.getByTestId("admin-mobile-drawer-close");
    fireEvent.click(closeBtn);

    await waitFor(() => {
      expect(screen.queryByTestId("admin-mobile-drawer")).not.toBeInTheDocument();
    });
  });

  it("gives every navigation item its own icon (no ambiguous glyph reuse)", () => {
    const items = NAV_GROUPS.flatMap((group) => group.items);
    const seen = new Map<unknown, string>();
    const clashes: string[] = [];
    for (const item of items) {
      const previous = seen.get(item.icon);
      if (previous) clashes.push(`${previous} / ${item.label}`);
      else seen.set(item.icon, item.label);
    }
    expect(clashes).toEqual([]);
  });

  it("does not advertise Registrations to read-only viewers", () => {
    const registrations = NAV_GROUPS.flatMap((group) => group.items).find(
      (item) => item.to === "/admin/registrations"
    );
    expect(registrations?.roles).toEqual(["super_admin", "editor", "registrar"]);
    expect(registrations?.roles ?? []).not.toContain("viewer");
  });

  it("hides Registrations from a viewer account but keeps the audit log", () => {
    mockUser = {
      id: "u-viewer",
      name: "Read Only",
      email: "viewer@its.ac.id",
      role: "viewer",
      divisions: [],
      active: true,
      totp_enabled: false,
      created_at: new Date().toISOString(),
    };

    renderWithProviders(
      <Routes>
        <Route path="/admin/*" element={<AdminLayout />}>
          <Route path="" element={<div>Dashboard</div>} />
        </Route>
      </Routes>,
      { route: "/admin" }
    );

    expect(screen.queryByTestId("admin-nav-registrations")).not.toBeInTheDocument();
    expect(screen.getByTestId("admin-nav-activity-log")).toBeInTheDocument();
  });

  it("labels the mobile drawer and moves focus into it, restoring focus on close", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/admin/*" element={<AdminLayout />}>
          <Route path="" element={<div>Dashboard</div>} />
        </Route>
      </Routes>,
      { route: "/admin" }
    );

    const toggle = screen.getByTestId("admin-mobile-menu-toggle");
    fireEvent.click(toggle);

    const drawer = await screen.findByTestId("admin-mobile-drawer");
    expect(drawer).toHaveAttribute("aria-label", "Admin navigation");
    expect(drawer).toHaveAttribute("aria-modal", "true");
    await waitFor(() => expect(drawer.contains(document.activeElement)).toBe(true));

    // Tab (and Shift+Tab) must never escape the open dialog.
    for (let i = 0; i < 30; i += 1) {
      fireEvent.keyDown(document, { key: "Tab" });
      expect(drawer.contains(document.activeElement)).toBe(true);
    }
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(drawer.contains(document.activeElement)).toBe(true);

    fireEvent.click(screen.getByTestId("admin-mobile-drawer-close"));
    await waitFor(() => expect(document.activeElement).toBe(toggle));
  });

  it("closes the mobile drawer on Escape and restores focus to the toggle", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/admin/*" element={<AdminLayout />}>
          <Route path="" element={<div>Dashboard</div>} />
        </Route>
      </Routes>,
      { route: "/admin" }
    );

    const toggle = screen.getByTestId("admin-mobile-menu-toggle");
    fireEvent.click(toggle);
    await screen.findByTestId("admin-mobile-drawer");

    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("admin-mobile-drawer")).toBeNull());
    expect(document.activeElement).toBe(toggle);
  });

  it("keeps the CMS theme control synchronized with the public theme preference", () => {
    renderWithProviders(
      <Routes>
        <Route path="/admin/*" element={<AdminLayout />}>
          <Route path="" element={<div>Dashboard</div>} />
        </Route>
      </Routes>,
      { route: "/admin" }
    );

    const toggle = screen.getByTestId("admin-theme-toggle-button");
    expect(toggle).toHaveAttribute("aria-label", "Dark mode");

    fireEvent.click(toggle);
    expect(localStorage.getItem("tnl-theme")).toBe("dark");
    expect(document.documentElement).toHaveClass("dark");
    expect(toggle).toHaveAttribute("aria-label", "Light mode");

    fireEvent(
      window,
      new StorageEvent("storage", { key: "tnl-theme", newValue: "light", storageArea: localStorage })
    );
    expect(document.documentElement).not.toHaveClass("dark");
    expect(toggle).toHaveAttribute("aria-label", "Dark mode");
  });

});
