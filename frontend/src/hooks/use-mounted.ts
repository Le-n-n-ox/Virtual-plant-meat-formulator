import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** True on the client after hydration; false during SSR and hydration. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
