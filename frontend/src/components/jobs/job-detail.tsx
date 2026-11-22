"use client";

import { ArrowLeftIcon, RadioIcon, SquareIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { JobProgress } from "@/components/jobs/job-progress";
import { JobStatusBadge } from "@/components/jobs/job-status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import { cancelJob, getJob } from "@/lib/api/jobs";
import { errorMessage, formatDateTime, humanizeKey } from "@/lib/format";
import { describeRunError, reattachToJob } from "@/lib/jobs/job-runner";
import { isTerminal, useJobStore } from "@/stores/jobStore";
import type { JobType } from "@/types";

/** Where each job type's results live, for the "view result" link. */
const RESULT_TABS: Record<string, string> = {
  nutrition: "nutrition",
  texture_prediction: "texture",
  optimization: "candidates",
};

export function JobDetailView() {
  const { id } = useParams<{ id: string }>();
  const {
    data: job,
    error,
    loading,
  } = useApiQuery(["jobs", id], () => getJob(id));

  const { activeJobId, events, connection } = useJobStore(
    useShallow((s) => ({
      activeJobId: s.activeJobId,
      events: s.events,
      connection: s.connection,
    })),
  );

  const [attaching, setAttaching] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const attached = activeJobId === id;
  const running = job ? !isTerminal(job.status) : false;

  /** Follow the job live: rebuild the store from GET /api/jobs/{id} + SSE. */
  async function reattach() {
    setAttaching(true);
    setAttachError(null);
    try {
      const ok = await reattachToJob(id);
      if (!ok)
        setAttachError(
          "This job could not be read. It may have finished or been removed.",
        );
    } catch (cause) {
      setAttachError(errorMessage(cause));
    } finally {
      setAttaching(false);
    }
  }

  // A job that is still queued or running is followed automatically, so opening
  // it from another tab shows the live timeline rather than a frozen snapshot.
  useEffect(() => {
    if (!job || isTerminal(job.status)) return;
    void reattachToJob(id);
    // `job` comes from a one-shot query, so its status does not change here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, job?.status]);

  async function cancel() {
    setCancelling(true);
    setCancelError(null);
    try {
      await cancelJob(id);
    } catch (cause) {
      setCancelError(errorMessage(cause));
    } finally {
      setCancelling(false);
    }
  }

  const resultTab = job ? (RESULT_TABS[job.type] ?? "report") : null;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <Link
        href="/jobs"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" aria-hidden /> Job history
      </Link>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : loading || !job ? (
        <Skeleton className="h-48 w-full" />
      ) : (
        <>
          <header className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {humanizeKey(String(job.type))} job
            </h1>
            <JobStatusBadge status={job.status} />
            {attached && running && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <span
                  aria-hidden
                  className="size-2 rounded-full bg-success animate-pulse motion-reduce:animate-none"
                />
                live ({connection})
              </span>
            )}
          </header>

          {job.error && (
            <p role="alert" className="text-sm text-destructive">
              {describeRunError(
                job.error.code ?? "job_failed",
                job.error.message ?? "The job failed.",
              )}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {running && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={attaching}
                  onClick={() => void reattach()}
                >
                  <RadioIcon aria-hidden />{" "}
                  {attached
                    ? "Re-attach to live stream"
                    : "Attach to live stream"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={cancelling}
                  onClick={() => void cancel()}
                >
                  <SquareIcon aria-hidden />{" "}
                  {cancelling ? "Cancelling…" : "Cancel"}
                </Button>
              </>
            )}
            {job.result_available && job.formulation_id && resultTab && (
              <Link
                href={`/formulations/${job.formulation_id}/${resultTab}`}
                className="text-sm text-primary underline underline-offset-4"
              >
                View result
              </Link>
            )}
          </div>

          {attachError && (
            <p role="alert" className="text-sm text-destructive">
              {attachError}
            </p>
          )}
          {cancelError && (
            <p role="alert" className="text-sm text-destructive">
              {cancelError}
            </p>
          )}

          <JobProgress types={job.type ? [job.type as JobType] : []} />

          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Job ID</dt>
            <dd className="font-mono text-xs">{job.id}</dd>
            <dt className="text-muted-foreground">Formulation</dt>
            <dd>
              {job.formulation_id ? (
                <>
                  <Link
                    href={`/formulations/${job.formulation_id}`}
                    className="text-primary underline underline-offset-4"
                  >
                    Open formulation
                  </Link>{" "}
                  (version {job.formulation_version})
                </>
              ) : (
                "—"
              )}
            </dd>
            <dt className="text-muted-foreground">Stage</dt>
            <dd>{job.stage_label ?? "—"}</dd>
            {job.progress_percent !== null && (
              <>
                <dt className="text-muted-foreground">Progress</dt>
                <dd className="tabular-nums">
                  {Math.round(job.progress_percent)}%
                </dd>
              </>
            )}
            {job.message && (
              <>
                <dt className="text-muted-foreground">Message</dt>
                <dd>{job.message}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Created</dt>
            <dd>{formatDateTime(job.created_at)}</dd>
            <dt className="text-muted-foreground">Started</dt>
            <dd>{formatDateTime(job.started_at)}</dd>
            <dt className="text-muted-foreground">Finished</dt>
            <dd>{formatDateTime(job.finished_at)}</dd>
            <dt className="text-muted-foreground">Calculation version</dt>
            <dd>{job.calc_version ?? "—"}</dd>
            <dt className="text-muted-foreground">Result</dt>
            <dd>{job.result_available ? "available" : "not available"}</dd>
          </dl>

          <section
            aria-label="Event log"
            className="flex flex-col gap-2 rounded-lg border p-3"
          >
            <h2 className="text-sm font-medium">Event log</h2>
            {events.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {running
                  ? "No events in this session yet. Attach to the live stream to follow the job."
                  : "No events were recorded in this session. Events are kept in memory, so a finished job shows them only if this page was open while it ran."}
              </p>
            ) : (
              <ol className="flex flex-col gap-1 text-xs">
                {events.map((e, i) => (
                  <li
                    key={`${e.seq ?? "seq"}-${i}`}
                    className="flex flex-wrap items-baseline gap-2"
                  >
                    <span className="tabular-nums text-muted-foreground">
                      {formatDateTime(e.timestamp)}
                    </span>
                    <span className="font-mono">{e.event}</span>
                    <span className="text-muted-foreground">{e.stage}</span>
                    {e.message && (
                      <span className="text-muted-foreground">{e.message}</span>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </main>
  );
}
