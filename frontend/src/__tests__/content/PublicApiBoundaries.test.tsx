import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePagePreview, useSubmitRegistration } from "@/lib/api/hooks";

function createClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
}

describe("public API boundaries", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("loads a draft only from the authenticated preview endpoint without HTTP caching", async () => {
    const preview = {
      id: "page-1", slug: "draft-page", title: "Draft", title_id: "Draf", status: "draft", blocks: [], created_at: "", updated_at: "",
    };
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => preview });
    vi.stubGlobal("fetch", fetchMock);
    const queryClient = createClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;

    const { result } = renderHook(() => usePagePreview("draft-page", "page-1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/pages/page-1/preview", expect.objectContaining({ method: "GET", cache: "no-store" }));
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes("/public/pages/"))).toBe(false);
    expect(queryClient.getQueryCache().find({ queryKey: ["auth", "page-preview", "draft-page", "page-1"] })?.options.gcTime).toBe(0);
    queryClient.clear();
  });

  it("posts registrations through the base-aware no-store API URL", async () => {
    const response = { ok: true, status: 200, json: async () => ({ ok: true, id: "registration-1", status: "accepted" }) };
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    const queryClient = createClient();
    const wrapper = ({ children }: { children: React.ReactNode }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    const { result } = renderHook(() => useSubmitRegistration("event/with space"), { wrapper });

    await result.current.mutateAsync(new FormData());

    expect(fetchMock).toHaveBeenCalledWith("/api/registrations/event%2Fwith%20space", expect.objectContaining({ method: "POST", cache: "no-store" }));
    queryClient.clear();
  });
});
