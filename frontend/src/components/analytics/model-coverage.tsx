"use client";

import { ChartFrame, ChartTable } from "@/components/charts/chart-frame";
import {
  chartThemeColors,
  PlotlyChart,
  plotlyLayout,
  type PlotData,
} from "@/components/charts/plotly-chart";
import { formatNumber, humanizeKey } from "@/lib/format";
import type { ModelListItem } from "@/types";
import { AnalyticsPanel } from "./analytics-panel";
import { modelStatusColor } from "./palette";
import { ENDPOINTS, useModelRegistry } from "./queries";

/** The lifecycle order the registry page uses; anything else is appended. */
const STATUS_ORDER = ["approved", "candidate", "retired"];

interface TargetCoverage {
  target: string;
  byStatus: Record<string, number>;
  total: number;
  approved: number;
}

function coverageByTarget(models: ModelListItem[]): TargetCoverage[] {
  const byTarget = new Map<string, Record<string, number>>();
  for (const model of models) {
    const counts = byTarget.get(model.target) ?? {};
    counts[model.status] = (counts[model.status] ?? 0) + 1;
    byTarget.set(model.target, counts);
  }
  return [...byTarget.entries()]
    .map(([target, byStatus]) => ({
      target,
      byStatus,
      total: Object.values(byStatus).reduce((sum, n) => sum + n, 0),
      approved: byStatus.approved ?? 0,
    }))
    .sort((a, b) => b.total - a.total || a.target.localeCompare(b.target));
}

function statusesIn(models: ModelListItem[]): string[] {
  const seen = [...new Set(models.map((m) => m.status))];
  return [
    ...STATUS_ORDER.filter((s) => seen.includes(s)),
    ...seen.filter((s) => !STATUS_ORDER.includes(s)).sort(),
  ];
}

/**
 * Model coverage: how many model records the registry holds for each prediction
 * target, and how many of those are approved.
 *
 * This counts registry records. It says nothing about how good a model is —
 * holdout error, training-set size and limitations live on the Models page,
 * where each one is shown with the record it belongs to.
 */
export function ModelCoverage() {
  const { data, error, loading } = useModelRegistry();
  const page = data?.value ?? null;
  const models: ModelListItem[] = page?.items ?? [];
  const rows = coverageByTarget(models);
  const statuses = statusesIn(models);
  const withApproved = rows.filter((r) => r.approved > 0).length;

  return (
    <AnalyticsPanel
      title="Model coverage"
      description="How many model records the registry holds per prediction target, and how many of them are approved. These are counts of registry records, not a measure of how well any model performs."
      source={ENDPOINTS.models}
      fetchedAt={data?.fetchedAt ?? null}
      loading={loading}
      error={error}
      empty={page !== null && models.length === 0}
      emptyMessage="No model has been trained yet, so the registry holds no records to count."
    >
      {page && models.length > 0 && (
        <>
          <p className="text-small text-muted-foreground">
            <span className="font-numeric text-foreground">
              {formatNumber(withApproved)}
            </span>{" "}
            of <span className="font-numeric">{formatNumber(rows.length)}</span>{" "}
            targets have at least one approved model record. A target with none
            cannot be predicted at all, and the texture page says so rather than
            showing a number.
          </p>
          <CoverageChart rows={rows} statuses={statuses} />
        </>
      )}
    </AnalyticsPanel>
  );
}

function CoverageChart({
  rows,
  statuses,
}: {
  rows: TargetCoverage[];
  statuses: string[];
}) {
  const colors = chartThemeColors();

  const data: PlotData[] = statuses.map((status) => ({
    type: "bar",
    name: humanizeKey(status),
    x: rows.map((r) => humanizeKey(r.target)),
    y: rows.map((r) => r.byStatus[status] ?? 0),
    marker: { color: modelStatusColor(status) },
    hovertemplate: `${humanizeKey(status)}: %{y} model records<extra></extra>`,
  }));

  return (
    <ChartFrame
      title="Model records per target, by status"
      description="One stacked bar per prediction target. Each lifecycle status is named in the legend and listed in the data table, so the bar's colour is never the only way to read it."
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
            yaxis: {
              title: { text: "model records" },
              gridcolor: colors.grid,
              // Registry records are whole numbers.
              dtick: 1,
              rangemode: "tozero",
            },
          }}
          ariaLabel={`Stacked bar chart of model records per target: ${rows
            .map(
              (r) =>
                `${humanizeKey(r.target)} ${r.total} records, ${r.approved} approved`,
            )
            .join("; ")}`}
        />
      }
      table={
        <ChartTable
          columns={[
            { key: "target", label: "Prediction target" },
            { key: "total", label: "Model records" },
            ...statuses.map((status) => ({
              key: status,
              label: humanizeKey(status),
            })),
          ]}
          rows={rows.map((r) => [
            humanizeKey(r.target),
            formatNumber(r.total),
            ...statuses.map((status) => formatNumber(r.byStatus[status] ?? 0)),
          ])}
        />
      }
    />
  );
}
