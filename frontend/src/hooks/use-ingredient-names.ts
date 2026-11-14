"use client";

import { useEffect, useState } from "react";
import { getIngredient } from "@/lib/api/ingredients";
import { useFormulationStore } from "@/stores/formulationStore";

// Module-level cache: ingredient names are stable for a session.
const cache = new Map<string, string>();
const pending = new Map<string, Promise<void>>();

function load(id: string): Promise<void> {
  let promise = pending.get(id);
  if (!promise) {
    promise = getIngredient(id)
      .then((ing) => {
        cache.set(id, ing.common_name);
      })
      .catch(() => {
        /* leave unresolved; the id is shown instead */
      })
      .finally(() => pending.delete(id));
    pending.set(id, promise);
  }
  return promise;
}

/** Resolves ingredient ids to names via the API (cached). Falls back to the id. */
export function useIngredientNames(ids: string[]): (id: string) => string {
  const [, bump] = useState(0);
  const catalog = useFormulationStore((s) => s.catalog);
  const key = [...new Set(ids)].sort().join(",");

  useEffect(() => {
    const missing = key
      .split(",")
      .filter(
        (id) =>
          id && !cache.has(id) && !useFormulationStore.getState().catalog[id],
      );
    if (missing.length === 0) return;
    let active = true;
    void Promise.all(missing.map(load)).then(() => {
      if (active) bump((n) => n + 1);
    });
    return () => {
      active = false;
    };
  }, [key]);

  return (id) => catalog[id]?.common_name ?? cache.get(id) ?? id;
}
