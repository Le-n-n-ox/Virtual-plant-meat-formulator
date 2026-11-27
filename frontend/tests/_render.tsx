import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  render,
  type RenderOptions,
  type RenderResult,
} from "@testing-library/react";
import type { ReactElement } from "react";

/**
 * `useApiQuery` runs on TanStack Query, so every component test needs a client.
 * `retry: false` keeps a rejected query an error rather than a silent retry, and
 * a fresh client per render keeps tests isolated.
 */
export function renderWithProviders(
  ui: ReactElement,
  options?: RenderOptions,
): RenderResult {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
    ...options,
  });
}
