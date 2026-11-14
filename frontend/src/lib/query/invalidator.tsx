"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { isTerminal, useJobStore } from "@/stores/jobStore";

/**
 * Refetches server data when a job reaches a terminal state, so result pages
 * and job lists reflect the finished run without a manual reload.
 */
export function JobInvalidator() {
  const client = useQueryClient();
  const status = useJobStore((s) => s.status);
  const jobId = useJobStore((s) => s.activeJobId);

  useEffect(() => {
    if (!isTerminal(status) || !jobId) return;
    void client.invalidateQueries({ queryKey: ["jobs"] });
    void client.invalidateQueries({ queryKey: ["results"] });
    void client.invalidateQueries({ queryKey: ["candidates"] });
    void client.invalidateQueries({ queryKey: ["formulations"] });
  }, [client, jobId, status]);

  return null;
}
