"use client";

import { FlaskConicalIcon } from "lucide-react";
import Link from "next/link";
import { JobStatusBadge } from "@/components/jobs/job-status";
import { buttonVariants } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import { listFormulations } from "@/lib/api/formulations";
import { errorMessage, formatDateTime } from "@/lib/format";

export function RecentFormulations() {
  const { data, error, loading } = useApiQuery("recent", () =>
    listFormulations({ page_size: 5 }),
  );

  if (error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {errorMessage(error)}
      </p>
    );
  if (loading) return <Skeleton className="h-32 w-full" />;
  if (!data || data.items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed p-8 text-center">
        <FlaskConicalIcon
          className="size-8 text-muted-foreground"
          aria-hidden
        />
        <p className="text-sm text-muted-foreground">
          You have no formulations yet.
        </p>
        <Link href="/formulations" className={buttonVariants({ size: "sm" })}>
          New formulation
        </Link>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y rounded-lg border">
        {data.items.map((f) => (
          <li key={f.id}>
            <Link
              href={`/formulations/${f.id}`}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-muted/50"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{f.name}</span>
                <span className="text-xs text-muted-foreground">
                  {f.current_version === 0
                    ? "unsaved"
                    : `v${f.current_version}`}{" "}
                  · updated {formatDateTime(f.updated_at)}
                </span>
              </span>
              {f.last_job && <JobStatusBadge status={f.last_job.status} />}
            </Link>
          </li>
        ))}
      </ul>
      <div className="flex gap-2">
        <Link
          href="/formulations"
          className={buttonVariants({ size: "sm", variant: "outline" })}
        >
          All formulations
        </Link>
        <Link href="/formulations" className={buttonVariants({ size: "sm" })}>
          New formulation
        </Link>
      </div>
    </div>
  );
}
