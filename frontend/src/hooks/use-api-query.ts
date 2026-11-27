"use client";

import { useQuery } from "@tanstack/react-query";
import { useCallback } from "react";

/**
 * The app's data hook, over TanStack Query.
 *
 * The return shape is unchanged so the call sites keep working: `data`, `error`,
 * `loading` and `reload`. What changes is the machinery — the cache, background
 * refetch and key-based invalidation now come from the query client instead of a
 * per-component `useState`.
 *
 * `key` must start with the resource name (for example `["formulations", id]`)
 * so `lib/query/invalidator.tsx` can invalidate a whole resource by prefix.
 */
export function useApiQuery<T>(
  key: unknown[],
  fetcher: () => Promise<T>,
  enabled = true,
) {
  const { data, error, isPending, refetch } = useQuery<T>({
    queryKey: key,
    queryFn: fetcher,
    enabled,
  });

  /** Forces a fresh fetch, as before. Prefer invalidating by resource. */
  const reload = useCallback(() => void refetch(), [refetch]);

  return {
    data: data ?? null,
    error: error ?? null,
    // `isPending` is true until the first data lands, and stays true while the
    // query is disabled — the explicit guard keeps the old meaning.
    loading: enabled && isPending,
    reload,
  };
}
