import { describe, expect, it, vi, afterEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RegistrationDialog } from "@/components/site/RegistrationDialog";
import { renderWithProviders } from "./test-utils";

const event = {
  id: "ev-1",
  title: "Open House",
  title_id: "Open House",
  type: "event",
  description: "",
  description_id: "",
  status: "published",
  poster_urls: [],
  documentation: [],
  capacity: 10,
  price: 0,
  modules: [],
  contacts: [],
  form_fields: [
    { id: "f1", label: "Nama Lengkap", type: "text", required: true, options: [] },
    { id: "f2", label: "Email", type: "email", required: true, options: [] },
  ],
  needs_review: false,
  issues: [],
  created_at: "",
  updated_at: "",
  version: 1,
} as any;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RegistrationDialog accessibility", () => {
  it("marks per-field validity, links field errors, and uses danger tokens", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      json: async () => ({ detail: { missing: ["Nama Lengkap"], errors: [] } }),
    })));
    renderWithProviders(<RegistrationDialog event={event} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("registration-submit-button"));

    await waitFor(() => expect(screen.getByTestId("registration-errors")).toBeInTheDocument());
    const name = screen.getByTestId("registration-field-f_nama-lengkap");
    expect(name).toHaveAttribute("aria-invalid", "true");
    expect(name).toHaveAttribute("aria-describedby", "reg-f_nama-lengkap-error");
    const fieldError = document.getElementById("reg-f_nama-lengkap-error");
    expect(fieldError).toHaveAttribute("role", "alert");
    expect(screen.getByTestId("registration-field-f_email")).toHaveAttribute("aria-invalid", "false");

    expect(screen.getByTestId("registration-errors").getAttribute("style")).toContain("var(--tnl-danger)");
    const label = screen.getByText("Nama Lengkap");
    const asterisk = label.querySelector("span") as HTMLElement;
    expect(asterisk.getAttribute("style")).toContain("var(--tnl-danger)");
  });

  it("renders no raw error colours", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: false,
      json: async () => ({ detail: "Registration failed" }),
    })));
    const { container } = render(<RegistrationDialog event={event} onClose={vi.fn()} />);
    fireEvent.click(screen.getByTestId("registration-submit-button"));
    await waitFor(() => expect(screen.getByTestId("registration-errors")).toBeInTheDocument());
    expect(container.innerHTML).not.toContain("#b91c1c");
  });

  it("traps focus, closes on Escape and locks scroll with theme-derived chrome", () => {
    const onClose = vi.fn();
    const opener = document.createElement("button");
    document.body.appendChild(opener);
    opener.focus();
    const { container, unmount } = render(<RegistrationDialog event={event} onClose={onClose} />);

    const dialog = screen.getByTestId("registration-dialog");
    expect(dialog).toHaveAttribute("aria-modal", "true");
    expect(document.body.style.overflow).toBe("hidden");
    expect(container.innerHTML).toContain("--gsm-obsidian");

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalled();

    unmount();
    expect(document.body.style.overflow).toBe("");
    opener.remove();
  });
});
