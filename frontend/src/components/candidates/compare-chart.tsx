"use client";

import { ChartFrame, ChartTable } from "@/components/charts/chart-frame";
import {
  chartThemeColors,
  PlotlyChart,
  plotlyLayout,
  type PlotData,
} from "@/components/charts/plotly-chart";
import { formatNumber, humanizeKey } from "@/lib/format";
import type { CompareResponse } from "@/types";

function label(metric: string): string {
  if (metric === "protein_g_per_100g") return "Protein";
  if (metric === "amino_acid_score") return "Amino acid score (AAS)";
  if (metric === "cost_per_kg.value") return "Cost per kg";
  return humanizeKey(metric);
}

/**
 * Grouped bar chart of the comparable numeric metrics for candidates A and B,
 * with the same values as a data table.
 */
export function CompareChart({ data }: { data: CompareResponse }) {
  const colors = chartThemeColors();
  const rows = data.differences.filter(
    (d): d is typeof d & { a: number; b: number } =>
      !d.metric.startsWith("percent:") &&
      typeof d.a === "number" &&
      typeof d.b === "number",
  );
  if (rows.length === 0) return null;

  const labels = rows.map((d) => label(d.metric));
  const traces: PlotData[] = [
    {
      type: "bar",
      name: "A",
      x: labels,
      y: rows.map((d) => d.a as number),
      marker: { color: colors.primary },
    },
    {
      type: "bar",
      name: "B",
      x: labels,
      y: rows.map((d) => d.b as number),
      marker: { color: colors.accent },
    },
  ];

  const table = (
    <ChartTable
      columns={[
        { key: "metric", label: "Metric" },
        { key: "unit", label: "Unit" },
        { key: "a", label: "A" },
        { key: "b", label: "B" },
      ]}
      rows={rows.map((d) => [
        label(d.metric),
        d.unit,
        d.a === null ? null : formatNumber(d.a),
        d.b === null ? null : formatNumber(d.b),
      ])}
    />
  );

  return (
    <ChartFrame
      title="A against B"
      description="Comparable numeric metrics for the two candidates. Ingredient shares are in the differences table above."
      chart={
        <PlotlyChart
          data={traces}
          layout={{
            ...plotlyLayout({
              font: colors.font,
              grid: colors.grid,
              bg: "transparent",
            }),
            barmode: "group",
            yaxis: { gridcolor: colors.grid },
          }}
          ariaLabel={`Grouped bar chart comparing candidate A and candidate B on ${rows
            .map((d) => label(d.metric))
            .join(", ")}`}
        />
      }
      table={table}
    />
  );
}
