"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";
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
import { listFormulations } from "@/lib/api/formulations";
import { listJobs } from "@/lib/api/jobs";
import {
  errorMessage,
  formatDateTime,
  formatDuration,
  humanizeKey,
} from "@/lib/format";

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  "queued",
  "running",
  "completed",
  "failed",
  "cancelled",
] as const;
const TYPE_OPTIONS = [
  "nutrition",
  "texture_prediction",
  "optimization",
  "model_training",
] as const;

type JobStatusFilter = (typeof STATUS_OPTIONS)[number];

interface JobsParams {
  status: "" | JobStatusFilter;
  type: string;
  formulation: string;
  page: number;
}

export function readParams(search: string): JobsParams {
  const p = new URLSearchParams(search);
  const status = p.get("status") ?? "";
  const type = p.get("type") ?? "";
  const page = Number(p.get("page"));
  return {
    status: (STATUS_OPTIONS as readonly string[]).includes(status)
      ? (status as JobStatusFilter)
      : "",
    type: (TYPE_OPTIONS as readonly string[]).includes(type) ? type : "",
    formulation: p.get("formulation") ?? "",
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
  };
}

export function toQueryString(p: JobsParams): string {
  const q = new URLSearchParams();
  if (p.status) q.set("status", p.status);
  if (p.type) q.set("type", p.type);
  if (p.formulation) q.set("formulation", p.formulation);
  if (p.page > 1) q.set("page", String(p.page));
  return q.toString();
}

const SELECT_CLASS =
  "h-8 rounded-lg border bg-background px-2 text-sm max-w-52";

export function JobList() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const params = useMemo(
    () => readParams(searchParams.toString()),
    [searchParams],
  );

  const push = useCallback(
    (patch: Partial<JobsParams>) => {
      const qs = toQueryString({ ...params, ...patch });
      router.replace(qs ? `/jobs?${qs}` : "/jobs", { scroll: false });
    },
    [params, router],
  );

  /** Every filter change restarts on the first page so results stay in view. */
  const filter = useCallback(
    (patch: Partial<JobsParams>) => push({ ...patch, page: 1 }),
    [push],
  );

  const { data, error, loading } = useApiQuery(
    [
      "jobs",
      {
        status: params.status,
        type: params.type,
        formulation: params.formulation,
        page: params.page,
      },
    ],
    () =>
      listJobs({
        status: params.status || undefined,
        type: params.type || undefined,
        formulation_id: params.formulation || undefined,
        page: params.page,
        page_size: PAGE_SIZE,
      }),
  );
  const formulations = useApiQuery(["formulations", { page_size: 100 }], () =>
    listFormulations({ page_size: 100 }),
  );

  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;
  const hasFilters = Boolean(
    params.status || params.type || params.formulation,
  );

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Job history</h1>
        <p className="text-sm text-muted-foreground">
          Calculations and predictions you have started. The address bar carries
          the filters, so a view can be shared and restored on reload.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <select
          className={SELECT_CLASS}
          aria-label="Filter by status"
          value={params.status}
          onChange={(e) =>
            filter({ status: e.target.value as JobsParams["status"] })
          }
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {humanizeKey(s)}
            </option>
          ))}
        </select>
        <select
          className={SELECT_CLASS}
          aria-label="Filter by type"
          value={params.type}
          onChange={(e) => filter({ type: e.target.value })}
        >
          <option value="">All types</option>
          {TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {humanizeKey(t)}
            </option>
          ))}
        </select>
        <select
          className={SELECT_CLASS}
          aria-label="Filter by formulation"
          value={params.formulation}
          onChange={(e) => filter({ formulation: e.target.value })}
        >
          <option value="">All formulations</option>
          {formulations.data?.items.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        {hasFilters && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() =>
              push({ status: "", type: "", formulation: "", page: 1 })
            }
          >
            Clear filters
          </Button>
        )}
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : loading ? (
        <Skeleton className="h-48 w-full" />
      ) : data && data.items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          <p>
            {hasFilters
              ? "No jobs match these filters."
              : "No jobs yet. Run a calculation from a formulation workspace."}
          </p>
          {hasFilters && (
            <Button
              size="sm"
              variant="outline"
              className="mt-3"
              onClick={() =>
                push({ status: "", type: "", formulation: "", page: 1 })
              }
            >
              Clear filters
            </Button>
          )}
        </div>
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
                    className="font-mono text-xs text-primary underline underline-offset-4"
                  >
                    {j.id.slice(-8)}
                  </Link>
                </TableCell>
                <TableCell>{humanizeKey(String(j.type))}</TableCell>
                <TableCell>
                  {j.formulation ? (
                    <>
                      <Link
                        href={`/formulations/${j.formulation.id}`}
                        className="underline underline-offset-4"
                      >
                        {j.formulation.name}
                      </Link>{" "}
                      <span className="text-xs text-muted-foreground">
                        v{j.formulation.version}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
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
              disabled={params.page <= 1}
              onClick={() => push({ page: params.page - 1 })}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={params.page >= pages}
              onClick={() => push({ page: params.page + 1 })}
            >
              Next
            </Button>
          </span>
        </nav>
      )}
    </main>
  );
}
