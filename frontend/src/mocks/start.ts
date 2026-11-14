import { isMocksEnabled } from "./config";
import { worker } from "./browser";

let starting: Promise<void> | null = null;

/**
 * Start the MSW worker exactly once. Called from instrumentation-client before
 * the app renders, so the first query is already intercepted. Safe to call from
 * several places; the first call wins and later callers await the same promise.
 */
export async function startMockWorker(): Promise<void> {
  if (!isMocksEnabled() || typeof window === "undefined") return;
  if (!starting) {
    starting = worker
      .start({ onUnhandledFrame: "bypass", quiet: true })
      .then(() => undefined);
  }
  await starting;
}
