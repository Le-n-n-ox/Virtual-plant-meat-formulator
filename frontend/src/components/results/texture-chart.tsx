"use client";

import { ChartFrame, ChartTable } from "@/components/charts/chart-frame";
import {
  chartThemeColors,
  PlotlyChart,
  plotlyLayout,
  type PlotData,
} from "@/components/charts/plotly-chart";
import { intervalOf } from "@/components/results/texture-interval";
import { formatNumber, humanizeKey } from "@/lib/format";
import type { TexturePrediction, TextureResult } from "@/types";

function interval(p: TexturePrediction): [number, number] | null {
  return intervalOf(p);
}

/**
 * Bar chart of the texture estimates with the reported prediction interval as
 * whiskers. Paired with a data table so the numbers survive without the chart.
 */
export function TextureChart({ result }: { result: TextureResult }) {
  const colors = chartThemeColors();
  const rows = result.predictions.filter((p) => typeof p.value === "number");
  if (rows.length === 0) return null;

  const data: PlotData[] = [
    {
      type: "bar",
      x: rows.map((p) => humanizeKey(p.target)),
      y: rows.map((p) => p.value as number),
      text: rows.map((p) => `${formatNumber(p.value as number)} ${p.unit}`),
      textposition: "auto",
      marker: {
        color: rows.map((p) =>
          p.in_domain === false ? colors.destructive : colors.primary,
        ),
      },
      error_y: {
        type: "data",
        symmetric: false,
        array: rows.map((p) => {
          const iv = interval(p);
          return iv ? iv[1] - (p.value as number) : 0;
        }),
        arrayminus: rows.map((p) => {
          const iv = interval(p);
          return iv ? (p.value as number) - iv[0] : 0;
        }),
        color: colors.font,
        thickness: 1.2,
      },
    },
  ];

  const table = (
    <ChartTable
      columns={[
        { key: "target", label: "Target" },
        { key: "value", label: "Estimate" },
        { key: "unit", label: "Unit" },
        { key: "low", label: "Interval low" },
        { key: "high", label: "Interval high" },
        { key: "domain", label: "In model domain" },
      ]}
      rows={rows.map((p) => {
        const iv = interval(p);
        return [
          humanizeKey(p.target),
          formatNumber(p.value as number),
          p.unit,
          iv ? formatNumber(iv[0]) : null,
          iv ? formatNumber(iv[1]) : null,
          p.in_domain === undefined
            ? "not reported"
            : p.in_domain
              ? "yes"
              : "no — outside domain",
        ];
      })}
    />
  );

  return (
    <ChartFrame
      title="Texture estimates with uncertainty"
      description="Bars are the model estimate; whiskers are the reported prediction interval. Estimates outside the model's training domain are shown in red."
      chart={
        <PlotlyChart
          data={data}
          layout={plotlyLayout({
            font: colors.font,
            grid: colors.grid,
            bg: "transparent",
          })}
          ariaLabel={`Bar chart of texture estimates for ${rows
            .map((p) => humanizeKey(p.target))
            .join(", ")}`}
        />
      }
      table={table}
    />
  );
}
