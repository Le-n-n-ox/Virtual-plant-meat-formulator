"use client";

import { useEffect } from "react";

/**
 * Warns before losing unsaved edits (guide §5 page 6).
 *
 * `beforeunload` covers closing or reloading the tab. The App Router has no
 * route blocker, so in-app navigation is covered by wrapping the History API
 * methods Next's router drives: a click on a `<Link>` goes through
 * `history.pushState`, and a cancelled navigation simply never calls through.
 * Both wrappers are restored on cleanup.
 */
export function useUnsavedChangesGuard(
  enabled: boolean,
  message: string,
): void {
  useEffect(() => {
    if (!enabled) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      // Setting returnValue is what makes the browser show its own prompt.
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    const pushState = history.pushState.bind(history);
    const replaceState = history.replaceState.bind(history);
    const confirmLeave = () => window.confirm(message);

    history.pushState = (...args: Parameters<typeof pushState>) => {
      if (!confirmLeave()) return;
      pushState(...args);
    };
    history.replaceState = (...args: Parameters<typeof replaceState>) => {
      if (!confirmLeave()) return;
      replaceState(...args);
    };

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      history.pushState = pushState;
      history.replaceState = replaceState;
    };
  }, [enabled, message]);
}
