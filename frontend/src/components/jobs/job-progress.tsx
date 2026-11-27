"use client";

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  CircleSlashIcon,
  Loader2Icon,
  SquareIcon,
  XCircleIcon,
} from "lucide-react";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Button } from "@/components/ui/button";
import { cancelJob } from "@/lib/api/jobs";
import { errorMessage, humanizeKey } from "@/lib/format";
import { isTerminal, useJobStore, type StageStatus } from "@/stores/jobStore";
import type { JobType } from "@/types";

const ICONS: Record<StageStatus, typeof Loader2Icon> = {
  active: Loader2Icon,
  complete: CheckCircle2Icon,
  warning: AlertTriangleIcon,
  failed: XCircleIcon,
  cancelled: CircleSlashIcon,
};

const STAGE_TEXT: Record<StageStatus, string> = {
  active: "in progress",
  complete: "done",
  warning: "warning",
  failed: "failed",
  cancelled: "cancelled",
};

const STAGE_CLASS: Record<StageStatus, string> = {
  active: "size-4 animate-spin text-info motion-reduce:animate-none",
  complete: "size-4 text-success",
  warning: "size-4 text-warning",
  failed: "size-4 text-destructive",
  cancelled: "size-4 text-muted-foreground",
};

/**
 * Live stage timeline for the active job (real SSE events from the job store).
 * Progress is a percentage only when an event carried one; otherwise it is
 * shown as indeterminate.
 */
export function JobProgress({
  types,
  cancellable = false,
}: {
  types: JobType[];
  cancellable?: boolean;
}) {
  const s = useJobStore(
    useShallow((st) => ({
      activeJobId: st.activeJobId,
      jobType: st.jobType,
      status: st.status,
      stages: st.stages,
      stageLabels: st.stageLabels,
      progressPercent: st.progressPercent,
      message: st.message,
      warnings: st.warnings,
      connection: st.connection,
    })),
  );
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);

  if (!s.activeJobId || !s.jobType || !types.includes(s.jobType)) return null;
  const jobId = s.activeJobId;
  const running = !isTerminal(s.status);
  const stages = Object.entries(s.stages);

  async function cancel() {
    setCancelling(true);
    setCancelError(null);
    try {
      await cancelJob(jobId);
    } catch (error) {
      setCancelError(errorMessage(error));
      setCancelling(false);
    }
  }

  return (
    <section
      aria-label="Job progress"
      aria-live="polite"
      className="flex flex-col gap-2 rounded-lg border p-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-h4">
          {humanizeKey(s.jobType)} job:{" "}
          <span className="text-muted-foreground">{s.status}</span>
        </h2>
        {cancellable && running && (
          <Button
            size="sm"
            variant="outline"
            disabled={cancelling}
            onClick={() => void cancel()}
          >
            <SquareIcon aria-hidden /> {cancelling ? "Cancelling…" : "Cancel"}
          </Button>
        )}
      </div>
      {running && (
        <div
          role="progressbar"
          aria-label="Job progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={
            s.progressPercent === null
              ? undefined
              : Math.round(s.progressPercent)
          }
          className="h-1.5 overflow-hidden rounded-full bg-muted"
        >
          {s.progressPercent === null ? (
            <div className="h-full w-1/3 animate-pulse rounded-full bg-primary motion-reduce:animate-none" />
          ) : (
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${s.progressPercent}%` }}
            />
          )}
        </div>
      )}
      {s.message && (
        <p className="text-small text-muted-foreground">
          {s.message}
          {running && s.progressPercent !== null
            ? ` (${Math.round(s.progressPercent)}%)`
            : ""}
        </p>
      )}
      {stages.length === 0 ? (
        <p className="flex items-center gap-1.5 text-small text-muted-foreground">
          <CircleDashedIcon className="size-3.5" aria-hidden /> Waiting for the
          worker to start ({s.connection})
        </p>
      ) : (
        <ol className="flex flex-col gap-1 text-small">
          {stages.map(([stage, status]) => {
            const Icon = ICONS[status];
            return (
              <li key={stage} className="flex items-center gap-2">
                <Icon aria-hidden className={STAGE_CLASS[status]} />
                <span>{s.stageLabels[stage] ?? humanizeKey(stage)}</span>
                <span className="text-caption text-muted-foreground">
                  {STAGE_TEXT[status]}
                </span>
              </li>
            );
          })}
        </ol>
      )}
      {s.warnings.length > 0 && (
        <ul className="flex flex-col gap-0.5 text-small text-muted-foreground">
          {s.warnings.map((w, i) => (
            <li key={`${w.timestamp}-${i}`} className="flex items-start gap-1">
              <AlertTriangleIcon
                className="mt-px size-3.5 shrink-0 text-warning"
                aria-hidden
              />
              {w.message}
            </li>
          ))}
        </ul>
      )}
      {cancelError && (
        <p role="alert" className="text-small text-destructive">
          {cancelError}
        </p>
      )}
    </section>
  );
}
