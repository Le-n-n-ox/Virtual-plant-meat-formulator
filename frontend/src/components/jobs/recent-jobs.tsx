"use client";

import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { JobStatusBadge } from "@/components/jobs/job-status";
import { useApiQuery } from "@/hooks/use-api-query";
import { listJobs } from "@/lib/api/jobs";
import { errorMessage } from "@/lib/format";

/**
 * Running and recent jobs (guide §5 page 2). Five rows, most recent first, each
 * linking to its job page. Progress stays on the job page — the dashboard only
 * answers "what is running and what happened last".
 */
export function RecentJobs() {
  const { data, error, loading } = useApiQuery(
    ["jobs", { page_size: 5, status: ["running", "failed", "completed"] }],
    () =>
      listJobs({
        page_size: 5,
        status: ["running", "failed", "completed"],
      }),
  );

  if (error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {errorMessage(error)}
      </p>
    );
  if (loading) return <Skeleton className="h-40 w-full" />;
  if (!data || data.items.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No jobs have run yet. Start one from a formulation.
      </p>
    );
  }

  return (
    <ul className="divide-y rounded-lg border">
      {data.items.map((job) => (
        <li key={job.id}>
          <Link
            href={`/jobs/${job.id}`}
            className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/50"
          >
            <span className="min-w-0">
              <span className="block truncate font-medium">
                {job.formulation.name}
              </span>
              <span className="text-xs text-muted-foreground">
                {job.type} · v{job.formulation.version}
                {job.stage_label ? ` · ${job.stage_label}` : ""}
              </span>
            </span>
            <JobStatusBadge status={job.status} />
          </Link>
        </li>
      ))}
    </ul>
  );
}
