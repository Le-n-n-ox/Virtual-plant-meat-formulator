import * as React from "react";

/**
 * Matches Tailwind's `lg`, which is where this app has always switched the
 * sidebar between a fixed column and a sheet. shadcn ships 768 (`md`); using
 * that would turn the sheet into a fixed sidebar between 768 and 1024px.
 */
const MOBILE_BREAKPOINT = 1024;
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`;

function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia(QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/**
 * True below the large breakpoint.
 *
 * `useSyncExternalStore` rather than the state-in-an-effect that shadcn ships:
 * the effect version trips this project's `react-hooks/set-state-in-effect`
 * rule, renders one frame with the wrong answer, and has no server snapshot.
 * The server answer is "not mobile", which matches the fixed sidebar the
 * workspace layout renders before hydration.
 */
export function useIsMobile(): boolean {
  return React.useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
