"use client";

import { useEffect, useRef } from "react";
import { startMockWorker } from "@/mocks/start";

/**
 * Client-only MSW bootstrap. Loaded through next/dynamic with `ssr: false` so
 * `msw/browser` never enters the server bundle.
 */
export default function MockWorkerStarter({
  onReady,
}: {
  onReady: () => void;
}) {
  const onReadyRef = useRef(onReady);
  useEffect(() => {
    onReadyRef.current = onReady;
  }, [onReady]);

  useEffect(() => {
    let active = true;
    startMockWorker()
      .catch(() => undefined)
      .finally(() => {
        if (active) onReadyRef.current();
      });
    return () => {
      active = false;
    };
  }, []);

  return null;
}
