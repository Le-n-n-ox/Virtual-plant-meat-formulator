"use client";

import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  CircleDashedIcon,
  CircleSlashIcon,
  Loader2Icon,
  XCircleIcon,
} from "lucide-react";
import { useShallow } from "zustand/react/shallow";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { useJobStore } from "@/stores/jobStore";
import type { JobStatus } from "@/types";

const STATUS_META: Record<
  JobStatus | "idle",
  { label: string; icon: typeof Loader2Icon; className: string }
> = {
  idle: {
    label: "Idle",
    icon: CircleDashedIcon,
    className: "text-muted-foreground",
  },
  queued: { label: "Queued", icon: CircleDashedIcon, className: "text-info" },
  running: { label: "Running", icon: Loader2Icon, className: "text-info" },
  completed: {
    label: "Complete",
    icon: CheckCircle2Icon,
    className: "text-success",
  },
  failed: { label: "Failed", icon: XCircleIcon, className: "text-destructive" },
  cancelled: {
    label: "Cancelled",
    icon: CircleSlashIcon,
    className: "text-muted-foreground",
  },
};

/** Status chip: icon + text, never colour alone. */
export function JobStatusChip({ className }: { className?: string }) {
  const status = useJobStore((s) => s.status);
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn("gap-1", className)}>
      <Icon
        className={cn(
          meta.className,
          status === "running" && "animate-spin motion-reduce:animate-none",
        )}
        aria-hidden
      />
      <span>Job: {meta.label}</span>
    </Badge>
  );
}

/** Static status badge for a known job status (lists, detail pages). */
export function JobStatusBadge({
  status,
  className,
}: {
  status: JobStatus;
  className?: string;
}) {
  const meta = STATUS_META[status] ?? STATUS_META.idle;
  return (
    <Badge variant="outline" className={cn("gap-1", className)}>
      <meta.icon className={meta.className} aria-hidden />
      <span>{meta.label}</span>
    </Badge>
  );
}

/**
 * Current stage + progress. A bar with a percentage appears only when the
 * worker reported a measurable value; otherwise an indeterminate indicator.
 */
export function JobProgress({ className }: { className?: string }) {
  const job = useJobStore(
    useShallow((s) => ({
      status: s.status,
      currentStage: s.currentStage,
      stageLabels: s.stageLabels,
      progress: s.progressPercent,
      message: s.message,
      warnings: s.warnings,
    })),
  );
  if (job.status === "idle") return null;

  const label = job.currentStage
    ? (job.stageLabels[job.currentStage] ?? job.currentStage)
    : "Waiting for worker";
  const meta = STATUS_META[job.status];
  const running = job.status === "running" || job.status === "queued";
  const lastWarning = job.warnings.at(-1);

  return (
    <div
      className={cn(
        "space-y-1.5 rounded-lg border bg-popover/90 p-2.5 text-caption shadow-sm backdrop-blur",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{label}</span>
        <span className={cn("flex items-center gap-1", meta.className)}>
          <meta.icon
            className={cn(
              "size-3.5",
              job.status === "running" &&
                "animate-spin motion-reduce:animate-none",
            )}
            aria-hidden
          />
          {meta.label}
          {job.progress !== null && running && (
            <span className="font-numeric">· {Math.round(job.progress)}%</span>
          )}
        </span>
      </div>
      {running &&
        (job.progress !== null ? (
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-valuenow={Math.round(job.progress)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={label}
          >
            <div
              className="h-full rounded-full bg-info transition-[width]"
              style={{ width: `${job.progress}%` }}
            />
          </div>
        ) : (
          <div
            className="h-1.5 overflow-hidden rounded-full bg-muted"
            role="progressbar"
            aria-label={`${label}, progress not measurable`}
          >
            <div className="h-full w-1/3 animate-[indeterminate_1.4s_ease-in-out_infinite] rounded-full bg-info/70 motion-reduce:w-full motion-reduce:animate-none motion-reduce:opacity-40" />
          </div>
        ))}
      {lastWarning && (
        <p className="flex items-start gap-1 text-foreground">
          <AlertTriangleIcon
            className="mt-px size-3.5 shrink-0 text-warning"
            aria-hidden
          />
          <span>{lastWarning.message}</span>
        </p>
      )}
      {(job.status === "failed" || job.status === "cancelled") &&
        job.message && <p className="text-muted-foreground">{job.message}</p>}
    </div>
  );
}
