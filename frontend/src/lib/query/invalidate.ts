"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";

/**
 * Invalidates a whole resource by query-key prefix — `["formulations"]` refetches
 * every formulation query, whatever its id or filters. Prefer this over a
 * component's own `reload()` after a mutation: it refreshes every screen showing
 * that resource, not just the one that made the change.
 */
export function useInvalidateResource() {
  const client = useQueryClient();
  return useCallback(
    (resource: string) => {
      void client.invalidateQueries({ queryKey: [resource] });
    },
    [client],
  );
}
