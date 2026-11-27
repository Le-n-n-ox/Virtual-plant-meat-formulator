"use client";

import { ChartFrame, ChartTable } from "@/components/charts/chart-frame";
import {
  chartThemeColors,
  PlotlyChart,
  plotlyLayout,
  type PlotData,
} from "@/components/charts/plotly-chart";
import { formatNumber, humanizeKey } from "@/lib/format";
import type { JobListItem, JobStatus } from "@/types";
import { AnalyticsPanel } from "./analytics-panel";
import {
  bucketJobsByDay,
  countByTypeAndStatus,
  JOB_STATUS_LABELS,
  JOB_STATUSES,
  type JobThroughput,
} from "./job-buckets";
import { jobStatusColors } from "./palette";
import { ENDPOINTS, PAGE_LIMIT, useJobWindow } from "./queries";

/**
 * Job throughput and outcomes over the window `GET /api/jobs` returned.
 *
 * The endpoint is paged and the backend caps a page at 100 records, so this is
 * not the full job history unless the history is shorter than the page. The
 * panel therefore names the window on screen — its first and last day, how many
 * records it holds and how many exist in total — rather than drawing a line and
 * letting it pass for a complete series.
 */
export function JobThroughputPanel() {
  const { data, error, loading } = useJobWindow();
  const page = data?.value ?? null;
  const jobs: JobListItem[] = page?.items ?? [];
  const throughput = bucketJobsByDay(jobs);

  return (
    <AnalyticsPanel
      title="Job throughput and outcomes"
      description="How many job records were created on each day of the fetched window, and how each type of job ended. These are counts of job records; a completed job is a job the worker finished, not a verdict on its result."
      source={ENDPOINTS.jobs}
      fetchedAt={data?.fetchedAt ?? null}
      loading={loading}
      error={error}
      empty={page !== null && jobs.length === 0}
      emptyMessage="No job has run yet, so there are no job records to bucket."
    >
      {page && jobs.length > 0 && (
        <>
          <WindowNote page={page} throughput={throughput} />
          <ThroughputChart throughput={throughput} />
          <OutcomesChart jobs={jobs} />
        </>
      )}
    </AnalyticsPanel>
  );
}

/** The honest description of what was fetched, above the charts that use it. */
function WindowNote({
  page,
  throughput,
}: {
  /** `total` is the full count on file, which the window is measured against. */
  page: { total: number };
  throughput: JobThroughput;
}) {
  const { buckets, counted, undated, filled } = throughput;
  const first = buckets[0]?.day;
  const last = buckets[buckets.length - 1]?.day;
  const complete = counted >= page.total;

  return (
    <div className="rounded-lg border border-dashed p-3 text-small text-muted-foreground">
      <p>
        Window:{" "}
        <span className="font-numeric text-foreground">
          {formatNumber(counted)}
        </span>{" "}
        job {counted === 1 ? "record" : "records"}
        {first && last
          ? first === last
            ? `, all created on ${first} (UTC)`
            : `, created between ${first} and ${last} (UTC)`
          : ""}
        .{" "}
        {complete
          ? `That is every job record on file (${formatNumber(page.total)}).`
          : `There are ${formatNumber(page.total)} job records on file; a request returns at most ${PAGE_LIMIT}, so this window is the most recent page and the earliest day shown may be only partly covered. The charts below bucket the window, not the full history.`}
      </p>
      {filled && (
        <p className="mt-1">
          A day inside the window with no job record is counted as 0 records,
          because the window does cover that day.
        </p>
      )}
      {undated > 0 && (
        <p className="mt-1">
          <span className="font-numeric text-foreground">
            {formatNumber(undated)}
          </span>{" "}
          {undated === 1 ? "record carries" : "records carry"} no readable
          creation time and {undated === 1 ? "is" : "are"} left out of the daily
          buckets rather than placed on a guessed day.
        </p>
      )}
    </div>
  );
}

function ThroughputChart({ throughput }: { throughput: JobThroughput }) {
  const colors = chartThemeColors();
  const statusColor = jobStatusColors();
  const { buckets } = throughput;
  const active = JOB_STATUSES.filter((status) =>
    buckets.some((b) => b.counts[status] > 0),
  );

  const data: PlotData[] = active.map((status) => ({
    type: "bar",
    name: JOB_STATUS_LABELS[status],
    x: buckets.map((b) => b.day),
    y: buckets.map((b) => b.counts[status]),
    marker: { color: statusColor[status] },
    hovertemplate: `${JOB_STATUS_LABELS[status]}: %{y} records on %{x}<extra></extra>`,
  }));

  return (
    <ChartFrame
      title="Job records per day, by outcome"
      description="One stacked bar per UTC day in the fetched window. Each segment is named in the legend and repeated in the data table, so the colour is never the only cue."
      chart={
        <PlotlyChart
          data={data}
          layout={{
            ...plotlyLayout({
              font: colors.font,
              grid: colors.grid,
              bg: "transparent",
            }),
            barmode: "stack",
            xaxis: { type: "category", gridcolor: colors.grid },
            yaxis: {
              title: { text: "job records" },
              gridcolor: colors.grid,
              // Record counts are whole numbers; a 0.5 tick would be nonsense.
              dtick: 1,
              rangemode: "tozero",
            },
          }}
          ariaLabel={`Stacked bar chart of job records per day: ${buckets
            .map((b) => `${b.day} ${b.total} records`)
            .join(", ")}`}
        />
      }
      table={
        <ChartTable
          columns={[
            { key: "day", label: "Day (UTC)" },
            { key: "total", label: "Job records" },
            ...active.map((status) => ({
              key: status,
              label: JOB_STATUS_LABELS[status],
            })),
          ]}
          rows={buckets.map((b) => [
            b.day,
            formatNumber(b.total),
            ...active.map((status) => formatNumber(b.counts[status])),
          ])}
        />
      }
    />
  );
}

function OutcomesChart({ jobs }: { jobs: JobListItem[] }) {
  const colors = chartThemeColors();
  const statusColor = jobStatusColors();
  const rows = countByTypeAndStatus(jobs);
  const active = JOB_STATUSES.filter((status) =>
    rows.some((r) => r.counts[status] > 0),
  );

  const data: PlotData[] = active.map((status) => ({
    type: "bar",
    name: JOB_STATUS_LABELS[status],
    x: rows.map((r) => humanizeKey(r.type)),
    y: rows.map((r) => r.counts[status]),
    marker: { color: statusColor[status] },
    hovertemplate: `${JOB_STATUS_LABELS[status]}: %{y} records<extra></extra>`,
  }));

  return (
    <ChartFrame
      title="Outcomes by job type, in this window"
      description="How the job records in the window ended, grouped by the kind of job. A failed job record says the worker stopped; it carries no claim about the formulation."
      chart={
        <PlotlyChart
          data={data}
          layout={{
            ...plotlyLayout({
              font: colors.font,
              grid: colors.grid,
              bg: "transparent",
            }),
            barmode: "group",
            yaxis: {
              title: { text: "job records" },
              gridcolor: colors.grid,
              dtick: 1,
              rangemode: "tozero",
            },
          }}
          ariaLabel={`Grouped bar chart of job outcomes by type: ${rows
            .map(
              (r) =>
                `${humanizeKey(r.type)} ${r.total} records (${active
                  .map(
                    (status) =>
                      `${JOB_STATUS_LABELS[status]} ${r.counts[status]}`,
                  )
                  .join(", ")})`,
            )
            .join("; ")}`}
        />
      }
      table={
        <ChartTable
          columns={[
            { key: "type", label: "Job type" },
            { key: "total", label: "Job records" },
            ...active.map((status) => ({
              key: status,
              label: JOB_STATUS_LABELS[status],
            })),
          ]}
          rows={rows.map((r) => [
            humanizeKey(r.type),
            formatNumber(r.total),
            ...active.map((status: JobStatus) =>
              formatNumber(r.counts[status]),
            ),
          ])}
        />
      }
    />
  );
}
