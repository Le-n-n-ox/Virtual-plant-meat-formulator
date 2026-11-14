"use client";

import { useCallback, useEffect, useState } from "react";

interface Settled<T> {
  key: string;
  data: T | null;
  error: Error | null;
}

/**
 * Runs `fetcher` whenever `key` changes (the key must encode every input the
 * fetcher uses). `loading` is derived, so there is no synchronous state write
 * inside the effect.
 */
export function useApiQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  enabled = true,
) {
  const [nonce, setNonce] = useState(0);
  const [settled, setSettled] = useState<Settled<T> | null>(null);
  const fullKey = `${key}#${nonce}`;

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    fetcher()
      .then((data) => {
        if (active) setSettled({ key: fullKey, data, error: null });
      })
      .catch((error: unknown) => {
        if (active)
          setSettled({
            key: fullKey,
            data: null,
            error: error instanceof Error ? error : new Error(String(error)),
          });
      });
    return () => {
      active = false;
    };
    // The caller encodes fetcher inputs in `key`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullKey, enabled]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const current = settled?.key === fullKey ? settled : null;
  return {
    data: current?.data ?? null,
    error: current?.error ?? null,
    loading: enabled && current === null,
    reload,
  };
}
