"use client";

import { useEffect } from "react";
import { usePreferencesStore } from "@/stores/preferencesStore";

/** Loads persisted preferences after hydration to avoid SSR mismatches. */
export function PreferencesHydrator() {
  useEffect(() => {
    void usePreferencesStore.persist.rehydrate();
  }, []);
  return null;
}
