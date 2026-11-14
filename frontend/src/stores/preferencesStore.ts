import { create } from "zustand";

export const usePreferencesStore = create<Record<string, never>>(() => ({}));
