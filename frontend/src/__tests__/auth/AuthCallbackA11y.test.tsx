import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import AuthCallback from "@/pages/admin/AuthCallback";
import { renderWithProviders } from "./test-utils";

const { apiPostMock, beginSessionMock } = vi.hoisted(() => ({
  apiPostMock: vi.fn(),
  beginSessionMock: vi.fn(),
}));

vi.mock("@/lib/api/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api/api")>("@/lib/api/api");
  return { ...actual, apiPost: apiPostMock };
});

vi.mock("@/lib/api/session", () => ({ beginSession: beginSessionMock }));

describe("AuthCallback accessibility", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    beginSessionMock.mockResolvedValue(undefined);
    window.location.hash = "";
  });

  it("announces the pending session exchange with a status region", () => {
    window.location.hash = "#session_id=pending";
    apiPostMock.mockImplementation(() => new Promise(() => {}));

    renderWithProviders(<AuthCallback />, { route: "/admin/auth/callback" });

    const status = screen.getByTestId("auth-callback-status");
    expect(status).toHaveAttribute("role", "status");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent(/signing you in/i);
  });

  it("moves focus to the recovery button when the exchange fails", async () => {
    window.location.hash = "#session_id=expired";
    apiPostMock.mockRejectedValueOnce(new Error("expired"));

    renderWithProviders(<AuthCallback />, { route: "/admin/auth/callback" });

    const back = await screen.findByTestId("auth-callback-back-button");
    await waitFor(() => expect(document.activeElement).toBe(back));
  });
});
