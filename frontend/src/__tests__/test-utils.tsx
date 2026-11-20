import React, { type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { render } from "@testing-library/react";
import { LocaleProvider } from "@/components/site/SiteLayout";

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });
}

export function renderWithProviders(
  ui: ReactNode,
  {
    route = "/",
    queryClient = createTestQueryClient(),
  }: { route?: string; queryClient?: QueryClient } = {}
) {
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <LocaleProvider>{ui}</LocaleProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
