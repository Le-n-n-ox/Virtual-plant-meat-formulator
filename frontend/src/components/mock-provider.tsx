"use client";

import dynamic from "next/dynamic";
import { useCallback, useState, type ReactNode } from "react";
import { isMocksEnabled } from "@/mocks/config";

// ssr:false keeps the service-worker module out of the server bundle.
const MockWorkerStarter = dynamic(() => import("./mock-worker-starter"), {
  ssr: false,
  loading: () => null,
});

/**
 * Boots the mock API before rendering children and keeps a persistent
 * "Mock data" banner on screen while NEXT_PUBLIC_USE_MOCKS is on.
 */
export function MockProvider({ children }: { children: ReactNode }) {
  const enabled = isMocksEnabled();
  const [ready, setReady] = useState(!enabled);
  const handleReady = useCallback(() => setReady(true), []);

  if (!enabled) return <>{children}</>;

  return (
    <>
      {ready ? (
        children
      ) : (
        <div className="flex min-h-svh items-center justify-center bg-background text-sm text-muted-foreground">
          Starting mock API…
        </div>
      )}
      <MockWorkerStarter onReady={handleReady} />
      <div
        role="status"
        className="fixed bottom-2 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-warning/50 bg-popover px-3 py-1.5 text-xs whitespace-nowrap text-muted-foreground shadow-md"
      >
        <span className="font-medium text-warning">Mock data</span>
        <span>synthetic values — not real nutrition or texture data.</span>
      </div>
    </>
  );
}
