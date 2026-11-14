"use client";

import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { JobStatusBadge } from "@/components/jobs/job-status";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import { getJob } from "@/lib/api/jobs";
import { describeRunError } from "@/lib/jobs/job-runner";
import { errorMessage, formatDateTime, humanizeKey } from "@/lib/format";

export function JobDetailView() {
  const { id } = useParams<{ id: string }>();
  const {
    data: job,
    error,
    loading,
  } = useApiQuery(`job|${id}`, () => getJob(id));

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
          </header>
          {job.error && (
            <p role="alert" className="text-sm text-destructive">
              {describeRunError(
                job.error.code ?? "job_failed",
                job.error.message ?? "The job failed.",
              )}
            </p>
          )}
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Job ID</dt>
            <dd className="font-mono text-xs">{job.id}</dd>
            <dt className="text-muted-foreground">Formulation</dt>
            <dd>
              <Link
                href={`/formulations/${job.formulation_id}`}
                className="text-primary underline-offset-4 hover:underline"
              >
                Open formulation
              </Link>{" "}
              (version {job.formulation_version})
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
        </>
      )}
    </main>
  );
}
