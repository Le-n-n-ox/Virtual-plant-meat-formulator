"use client";

import Link from "next/link";
import { useState } from "react";
import { JobStatusBadge } from "@/components/jobs/job-status";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiQuery } from "@/hooks/use-api-query";
import { listJobs } from "@/lib/api/jobs";
import {
  errorMessage,
  formatDateTime,
  formatDuration,
  humanizeKey,
} from "@/lib/format";

const PAGE_SIZE = 20;

export function JobList() {
  const [page, setPage] = useState(1);
  const { data, error, loading } = useApiQuery(`jobs|${page}`, () =>
    listJobs({ page, page_size: PAGE_SIZE }),
  );
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Job history</h1>
        <p className="text-sm text-muted-foreground">
          Calculations and predictions you have started.
        </p>
      </header>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : loading ? (
        <Skeleton className="h-48 w-full" />
      ) : data && data.items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No jobs yet. Run a calculation from a formulation workspace.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Job</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Formulation</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>Finished</TableHead>
              <TableHead className="text-right">Duration</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.items.map((j) => (
              <TableRow key={j.id}>
                <TableCell>
                  <Link
                    href={`/jobs/${j.id}`}
                    className="font-mono text-xs text-primary underline-offset-4 hover:underline"
                  >
                    {j.id.slice(-8)}
                  </Link>
                </TableCell>
                <TableCell>{humanizeKey(String(j.type))}</TableCell>
                <TableCell>
                  <Link
                    href={`/formulations/${j.formulation.id}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {j.formulation.name}
                  </Link>{" "}
                  <span className="text-xs text-muted-foreground">
                    v{j.formulation.version}
                  </span>
                </TableCell>
                <TableCell>
                  <JobStatusBadge status={j.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateTime(j.created_at)}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateTime(j.finished_at)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatDuration(j.duration_ms)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      {data && data.total > data.page_size && (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-between text-sm"
        >
          <span className="text-muted-foreground">
            Page {data.page} of {pages} · {data.total} jobs
          </span>
          <span className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </span>
        </nav>
      )}
    </main>
  );
}
