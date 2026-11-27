"use client";

import { useEffect, useState } from "react";
import { getHealth } from "@/lib/api/system";

type BackendStatusState = "checking" | "connected" | "unreachable";

export function BackendStatus() {
  const [status, setStatus] = useState<BackendStatusState>("checking");
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    getHealth()
      .then((health) => {
        if (!active) return;
        setVersion(health.version);
        setStatus("connected");
      })
      .catch(() => {
        if (active) setStatus("unreachable");
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <section aria-live="polite" className="rounded-md border p-4">
      <h2 className="text-h4">Backend status</h2>
      <p className="text-small text-muted-foreground">
        {status === "connected" && `connected (version ${version})`}
        {status === "unreachable" && "not reachable"}
        {status === "checking" && "checking connection…"}
      </p>
    </section>
  );
}
