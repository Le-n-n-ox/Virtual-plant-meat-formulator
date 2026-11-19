"use client";

import { ChartFrame, ChartTable } from "@/components/charts/chart-frame";
import {
  chartThemeColors,
  PlotlyChart,
  plotlyLayout,
  type PlotData,
} from "@/components/charts/plotly-chart";
import { costOf } from "@/components/workspace/candidates-tab";
import { formatNumber } from "@/lib/format";
import type { Candidate } from "@/types";

/**
 * Scatter of the optimization candidates: protein against cost per kg, with
 * Pareto-optimal candidates highlighted. Paired with a data table.
 */
export function CandidateScatter({ candidates }: { candidates: Candidate[] }) {
  const colors = chartThemeColors();
  const points = candidates
    .map((c) => ({
      c,
      protein:
        typeof c.metrics.protein_g_per_100g === "number"
          ? (c.metrics.protein_g_per_100g as number)
          : null,
      cost: costOf(c)?.value ?? null,
    }))
    .filter((p) => p.protein !== null && p.cost !== null);
  if (points.length === 0) return null;

  const paretoPoints = points.filter((p) => p.c.pareto);
  const dominated = points.filter((p) => !p.c.pareto);

  const data: PlotData[] = [
    {
      type: "scatter",
      mode: "markers",
      name: "Pareto optimal",
      x: paretoPoints.map((p) => p.protein),
      y: paretoPoints.map((p) => p.cost),
      text: paretoPoints.map((p) => `rank ${p.c.rank}`),
      marker: { color: colors.primary, size: 11, symbol: "diamond" },
    },
    {
      type: "scatter",
      mode: "markers",
      name: "Dominated",
      x: dominated.map((p) => p.protein),
      y: dominated.map((p) => p.cost),
      text: dominated.map((p) => `rank ${p.c.rank}`),
      marker: { color: colors.font, size: 8 },
    },
  ];

  const table = (
    <ChartTable
      columns={[
        { key: "rank", label: "Rank" },
        { key: "protein", label: "Protein (g/100 g)" },
        { key: "cost", label: "Cost per kg" },
        { key: "pareto", label: "Pareto optimal" },
      ]}
      rows={points.map((p) => {
        const cost = costOf(p.c);
        return [
          p.c.rank,
          p.protein === null ? null : formatNumber(p.protein),
          cost ? `${formatNumber(cost.value)} ${cost.currency}` : null,
          p.c.pareto ? "yes" : "no",
        ];
      })}
    />
  );

  return (
    <ChartFrame
      title="Candidate trade-off"
      description="Each point is a candidate formulation, plotted as protein against cost per kg. Diamonds are Pareto-optimal: no other candidate is better on both."
      chart={
        <PlotlyChart
          data={data}
          layout={{
            ...plotlyLayout({
              font: colors.font,
              grid: colors.grid,
              bg: "transparent",
            }),
            xaxis: {
              title: { text: "Protein (g per 100 g)" },
              gridcolor: colors.grid,
            },
            yaxis: {
              title: { text: "Cost per kg" },
              gridcolor: colors.grid,
            },
          }}
          ariaLabel={`Scatter chart of ${points.length} candidates, protein against cost per kg`}
        />
      }
      table={table}
    />
  );
}
