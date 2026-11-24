import { describe, it, expect, vi } from "vitest";
import { screen, fireEvent, waitFor } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";
import AdminLogin from "@/pages/admin/AdminLogin";
import ContentManager from "@/pages/admin/ContentManager";
import ContentEditor from "@/pages/admin/ContentEditor";
import { RegistrarPage, ThemePage, publishedEventQuota } from "@/pages/admin/AdminScreens";
import { renderWithProviders } from "./test-utils";
import * as api from "@/lib/api";
import type { LabEvent } from "@/lib/types";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    apiGet: vi.fn().mockImplementation((url: string) => {
      if (url.includes("/auth/me")) {
        return Promise.resolve({
          id: "u-admin",
          name: "Super Admin",
          email: "admin@its.ac.id",
          role: "super_admin",
        });
      }
      if (url.includes("/admin/theme")) {
        return Promise.resolve({
          draft: {
            primary_color: "#223027",
            emerald_color: "#5D8A6B",
            obsidian_color: "#0C100E",
            accent_color: "#A8977B",
            accent_hover_color: "#C2B091",
            color_surface: "#FAF7F2",
            color_body: "#1E2521",
            color_tan_text: "#6E604B",
          },
          published: {
            primary_color: "#223027",
            emerald_color: "#5D8A6B",
            accent_color: "#A8977B",
          },
          contrast: [
            { label: "Body text on surface", ratio: 14.65, passes: true },
            { label: "Accent text on button", ratio: 6.43, passes: true },
          ],
        });
      }
      if (url.includes("/admin/registrations")) {
        return Promise.resolve({
          items: [
            {
              id: "reg-1",
              event_title: "Open House TNL 2026",
              email: "peserta@its.ac.id",
              nim: "5024211001",
              status: "attended",
              data: { "f_full-name": "Ahmad Dani" },
            },
          ],
          total: 1,
          counts: { pending: 0, accepted: 0, attended: 1 },
        });
      }
      if (url.includes("/admin/content/members")) {
        return Promise.resolve({
          items: [
            {
              id: "m-1",
              name: "Dr. Ir. Achmad Affandi, DEA.",
              role: "lecturer",
              position: "head",
              division: "BPH",
              status: "active",
              is_head: true,
              published: true,
              show_nim: false,
            },
          ],
          total: 1,
        });
      }
      if (url.includes("/admin/content/events")) {
        return Promise.resolve({
          items: [{ id: "ev-1", title: "Cisco Packet Tracer Training", status: "published" }],
          total: 1,
        });
      }
      if (url.includes("/admin/media")) {
        return Promise.resolve({ items: [], total: 0, assets: [] });
      }
      if (url.includes("/public/members")) {
        return Promise.resolve([]);
      }
      return Promise.resolve({});
    }),
    apiPost: vi.fn().mockResolvedValue({ ok: true, synced: 1 }),
    apiPut: vi.fn().mockResolvedValue({ id: "ev-1", status: "draft" }),
    apiDelete: vi.fn().mockResolvedValue({ ok: true }),
  };
});

describe("Admin CMS Components", () => {
  it("AdminLogin renders sign-in form with email and password inputs", () => {
    renderWithProviders(<AdminLogin />, { route: "/admin/login" });

    expect(screen.getByLabelText(/Email/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/Password/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sign in|Masuk/i })).toBeInTheDocument();
  });

  it("RegistrarPage renders exports and filters without Sheets or scoring controls", () => {
    renderWithProviders(<RegistrarPage />, { route: "/admin/registrations" });

    expect(screen.getByText(/Registrations/i)).toBeTruthy();
    expect(screen.queryByTestId("registrations-score-button")).toBeNull();
    expect(screen.queryByTestId("sync-sheet-btn")).toBeNull();
    expect(screen.getByText("Export Excel (.xlsx)")).toBeTruthy();
    expect(screen.getByText("CSV")).toBeTruthy();
    expect(screen.queryByText("Quality")).toBeNull();
  });

  it("published event quota excludes draft events", () => {
    const events = [
      { id: "ev-1", title: "Open House", capacity: 30, status: "published" },
      { id: "ev-2", title: "Cisco Packet Tracer Training", capacity: 40, status: "draft" },
    ] as LabEvent[];

    expect(publishedEventQuota(events)).toBe(30);
  });

  it("ThemePage renders GSM theme tokens with color inputs", async () => {
    renderWithProviders(<ThemePage />, { route: "/admin/theme" });

    // Verify GSM Deep Forest token input
    const primaryInput = await screen.findByTestId("theme-gsm-primary_color");
    expect(primaryInput).toBeInTheDocument();
    expect(primaryInput).toHaveValue("#223027");

    // Verify GSM Warm Sand token input
    const accentInput = screen.getByTestId("theme-gsm-accent_color");
    expect(accentInput).toBeInTheDocument();
    expect(accentInput).toHaveValue("#a8977b");
  });

  it("RegistrarPage renders delete button for admin and confirms deletion", async () => {
    renderWithProviders(<RegistrarPage />, { route: "/admin/registrations" });

    const delBtn = await screen.findByTestId("registration-delete-reg-1");
    expect(delBtn).toBeInTheDocument();

    fireEvent.click(delBtn);

    const confirmBtn = await screen.findByTestId("registration-delete-reg-1-confirm");
    expect(confirmBtn).toBeInTheDocument();

    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(api.apiDelete).toHaveBeenCalledWith("/admin/registrations/reg-1");
    });
  });

  it("ContentManager renders 1-click Hide/Publish toggle for events and updates status", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/admin/content/:resource" element={<ContentManager />} />
      </Routes>,
      { route: "/admin/content/events" }
    );

    const toggleBtn = await screen.findByTestId("content-toggle-publish-ev-1");
    expect(toggleBtn).toBeInTheDocument();
    expect(toggleBtn).toHaveTextContent("Hide");

    fireEvent.click(toggleBtn);

    await waitFor(() => {
      expect(api.apiPut).toHaveBeenCalledWith("/admin/content/events/ev-1", { status: "draft" });
    });
  });

  it("RegistrarPage shows the live 15s badge and can pause polling", async () => {
    renderWithProviders(<RegistrarPage />, { route: "/admin/registrations" });

    const badge = await screen.findByTestId("registrations-live-badge");
    expect(badge).toHaveTextContent("Live · 15s");
    expect(screen.getByTestId("registrations-last-updated")).toBeInTheDocument();

    // Check-in keeps working: the delete affordance is still rendered while live.
    expect(await screen.findByTestId("registration-delete-reg-1")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("registrations-live-toggle"));

    await waitFor(() => expect(badge).toHaveTextContent("Live paused"));
    expect(screen.getByTestId("registrations-live-toggle")).toHaveTextContent("Resume");
    expect(screen.getByTestId("registration-delete-reg-1")).toBeInTheDocument();
  });

  /* ---------------------------------------------------------------- *
   * List View vs dedicated Editor View (route split)                 *
   * ---------------------------------------------------------------- */

  it("ContentManager list view renders no inline edit form and links into the editor route", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/admin/content/:resource" element={<ContentManager />} />
      </Routes>,
      { route: "/admin/content/events" }
    );

    // Row + row actions still present.
    expect(await screen.findByTestId("content-toggle-publish-ev-1")).toBeInTheDocument();
    expect(screen.getByTestId("content-edit-ev-1")).toHaveAttribute("href", "/admin/content/events/ev-1");
    expect(screen.getByTestId("content-add-button")).toHaveAttribute("href", "/admin/content/events/new");

    // The old inline "Edit item" form must be gone from the list view.
    expect(screen.queryByTestId("content-save-button")).toBeNull();
    expect(screen.queryByTestId("content-cancel-button")).toBeNull();

    // One-row filter bar with counts.
    expect(screen.getByTestId("content-filter-bar")).toBeInTheDocument();
    expect(screen.getByTestId("content-tab-all")).toHaveTextContent("All (1)");
    expect(screen.getByTestId("content-tab-draft")).toHaveTextContent("Draft (0)");
    expect(screen.getByTestId("content-search-input")).toBeInTheDocument();
    expect(screen.getByTestId("content-table")).toBeInTheDocument();
  });

  it("ContentEditor create route renders the sticky action bar with 'Create & Publish'", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/admin/content/:resource/new" element={<ContentEditor />} />
      </Routes>,
      { route: "/admin/content/events/new" }
    );

    const bar = screen.getByTestId("content-editor-bar");
    expect(bar.className).toContain("sticky");
    expect(bar.className).toContain("top-0");
    expect(bar.className).toContain("z-20");

    expect(screen.getByTestId("content-editor-title")).toHaveTextContent("New Event");
    expect(screen.getByTestId("content-editor-back")).toHaveAttribute("href", "/admin/content/events");
    expect(screen.getByTestId("content-editor-status")).toHaveTextContent("Draft");
    expect(screen.getByTestId("content-save-button")).toHaveTextContent("Create & Publish");

    // Bilingual tab switcher present, EN active by default.
    expect(screen.getByTestId("content-lang-en")).toBeInTheDocument();
    expect(screen.getByTestId("content-lang-id")).toBeInTheDocument();

    // Two-column editor body + sticky inspector.
    expect(screen.getByTestId("content-inspector")).toBeInTheDocument();
    expect(screen.getByTestId("content-section-publish")).toBeInTheDocument();
  });

  it("ContentEditor edit route loads the item, flags dirty state and saves via apiPut", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/admin/content/:resource/:id" element={<ContentEditor />} />
      </Routes>,
      { route: "/admin/content/events/ev-1" }
    );

    expect(await screen.findByTestId("content-editor-title")).toHaveTextContent("Cisco Packet Tracer Training");
    expect(screen.getByTestId("content-editor-status")).toHaveTextContent("Published");
    expect(screen.queryByTestId("content-dirty-badge")).toBeNull();

    fireEvent.change(screen.getByTestId("content-field-title"), { target: { value: "Updated title" } });

    expect(await screen.findByTestId("content-dirty-badge")).toHaveTextContent("Unsaved changes");
    expect(screen.getByTestId("content-save-button")).toHaveTextContent("Save changes");

    fireEvent.click(screen.getByTestId("content-save-button"));

    await waitFor(() => {
      expect(api.apiPut).toHaveBeenCalledWith(
        "/admin/content/events/ev-1",
        expect.objectContaining({ title: "Updated title" })
      );
    });
  });

  it("EN/ID tabs keep BOTH language values in state and mark the inactive tab", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/admin/content/:resource/:id" element={<ContentEditor />} />
      </Routes>,
      { route: "/admin/content/events/ev-1" }
    );

    const enField = (await screen.findByTestId("content-field-title")) as HTMLInputElement;
    fireEvent.change(enField, { target: { value: "English headline" } });

    // Switch to Bahasa Indonesia and fill the sibling field.
    fireEvent.click(screen.getByTestId("content-lang-id"));
    const idField = screen.getByTestId("content-field-title_id") as HTMLInputElement;
    expect(idField.value).toBe("");
    fireEvent.change(idField, { target: { value: "Judul Bahasa Indonesia" } });

    // Back to English: the original value survived, and the ID tab now shows a dot.
    fireEvent.click(screen.getByTestId("content-lang-en"));
    expect((screen.getByTestId("content-field-title") as HTMLInputElement).value).toBe("English headline");
    expect(screen.getByTestId("content-lang-dot-id")).toBeInTheDocument();

    // Saving emits both values.
    fireEvent.click(screen.getByTestId("content-save-button"));
    await waitFor(() => {
      expect(api.apiPut).toHaveBeenCalledWith(
        "/admin/content/events/ev-1",
        expect.objectContaining({ title: "English headline", title_id: "Judul Bahasa Indonesia" })
      );
    });
  });

  it("leaving the editor with unsaved changes asks for confirmation", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);

    renderWithProviders(
      <Routes>
        <Route path="/admin/content/:resource" element={<ContentManager />} />
        <Route path="/admin/content/:resource/:id" element={<ContentEditor />} />
      </Routes>,
      { route: "/admin/content/events/ev-1" }
    );

    fireEvent.change(await screen.findByTestId("content-field-title"), { target: { value: "Dirty title" } });
    await screen.findByTestId("content-dirty-badge");

    // Declining the confirm keeps us in the editor.
    fireEvent.click(screen.getByTestId("content-cancel-button"));
    expect(confirmSpy).toHaveBeenCalled();
    expect(screen.getByTestId("content-editor-events")).toBeInTheDocument();

    // Accepting it navigates to the list view.
    confirmSpy.mockReturnValue(true);
    fireEvent.click(screen.getByTestId("content-cancel-button"));
    expect(await screen.findByTestId("content-add-button")).toBeInTheDocument();

    confirmSpy.mockRestore();
  });

  /* ---------------------------------------------------------------- *
   * Design System v2 — house select & switch inside the editor      *
   * ---------------------------------------------------------------- */

  it("CMS select and boolean fields render the shared TNL Studio controls", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/admin/content/:resource/:id" element={<ContentEditor />} />
      </Routes>,
      { route: "/admin/content/members/m-1" }
    );

    // Selects: house style (h-9, appearance-none) with the pinned chevron —
    // never the 46px `tnl-field` browser arrow that broke the toolbar rows.
    const position = (await screen.findByTestId("content-field-position")) as HTMLSelectElement;
    expect(position.tagName).toBe("SELECT");
    expect(position.className).toContain("appearance-none");
    expect(position.className).toContain("h-9");
    expect(position.parentElement?.className).toContain("relative");
    expect(position.parentElement?.querySelector("svg")).not.toBeNull();
    expect((screen.getByTestId("content-field-division") as HTMLSelectElement).className).toContain("appearance-none");

    // Booleans: a real switch (role + aria-checked), not a raw Yes/No checkbox.
    const head = screen.getByTestId("content-field-is_head");
    expect(head).toHaveAttribute("role", "switch");
    expect(head).toHaveAttribute("aria-checked", "true");
    fireEvent.click(head);
    expect(head).toHaveAttribute("aria-checked", "false");

    expect(screen.getByTestId("content-field-published")).toHaveAttribute("role", "switch");
    expect(screen.getByTestId("content-field-show_nim")).toHaveAttribute("aria-checked", "false");

    // The inspector sidebar holds zero raw checkboxes / unstyled selects.
    const inspector = screen.getByTestId("content-inspector");
    expect(inspector.querySelectorAll('input[type="checkbox"]').length).toBe(0);
    expect(Array.from(inspector.querySelectorAll("select")).every((el) => el.className.includes("appearance-none"))).toBe(true);
  });

  /* ---------------------------------------------------------------- *
   * Draft Autosave, Recovery & Live Preview                         *
   * ---------------------------------------------------------------- */

  it("ContentEditor offers Live Preview modal with device and language switchers", async () => {
    renderWithProviders(
      <Routes>
        <Route path="/admin/content/:resource/new" element={<ContentEditor />} />
      </Routes>,
      { route: "/admin/content/posts/new" }
    );

    const previewBtn = screen.getByTestId("content-preview-button");
    expect(previewBtn).toBeInTheDocument();

    fireEvent.click(previewBtn);
    expect(await screen.findByTestId("content-preview-modal")).toBeInTheDocument();
    expect(screen.getByTestId("content-preview-device-desktop")).toBeInTheDocument();
    expect(screen.getByTestId("content-preview-device-mobile")).toBeInTheDocument();
    expect(screen.getByTestId("content-preview-lang-en")).toBeInTheDocument();
    expect(screen.getByTestId("content-preview-lang-id")).toBeInTheDocument();

    // Toggle device
    fireEvent.click(screen.getByTestId("content-preview-device-mobile"));
    expect(screen.getByTestId("content-preview-body").querySelector(".w-\\[390px\\]")).not.toBeNull();
  });

  it("ContentEditor displays draft recovery banner when existing local draft is found", async () => {
    localStorage.setItem(
      "tnl-draft:events:new",
      JSON.stringify({
        timestamp: new Date().toISOString(),
        form: { title: "Restored Event Draft", title_id: "Draf Acara" },
      })
    );

    renderWithProviders(
      <Routes>
        <Route path="/admin/content/:resource/new" element={<ContentEditor />} />
      </Routes>,
      { route: "/admin/content/events/new" }
    );

    expect(await screen.findByTestId("content-draft-banner")).toBeInTheDocument();
    const restoreBtn = screen.getByTestId("content-restore-draft-btn");
    fireEvent.click(restoreBtn);

    expect(screen.queryByTestId("content-draft-banner")).toBeNull();
    localStorage.removeItem("tnl-draft:events:new");
  });
});
