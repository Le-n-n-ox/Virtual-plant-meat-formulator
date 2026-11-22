"use client";

import { ChartFrame, ChartTable } from "@/components/charts/chart-frame";
import {
  chartThemeColors,
  PlotlyChart,
  plotlyLayout,
  type PlotData,
} from "@/components/charts/plotly-chart";
import { formatNumber, humanizeKey } from "@/lib/format";
import type { AminoAcidBlock } from "@/types";

/**
 * Amino-acid score per acid against the reference pattern, with a dashed line
 * at 1.0 (the reference itself) and the limiting acid in red. A score is never
 * labelled DIAAS: the backend scores against a reference pattern only.
 */
export function AminoAcidScoreChart({ block }: { block: AminoAcidBlock }) {
  const colors = chartThemeColors();
  if (block.scores.length === 0) return null;

  const data: PlotData[] = [
    {
      type: "bar",
      name: "Score",
      x: block.scores.map((s) => humanizeKey(s.key)),
      y: block.scores.map((s) => s.score),
      text: block.scores.map((s) =>
        s.score === null ? "not computable" : formatNumber(s.score),
      ),
      textposition: "auto",
      marker: {
        color: block.scores.map((s) =>
          s.key === block.limiting_amino_acid
            ? colors.destructive
            : colors.primary,
        ),
      },
    },
  ];

  const table = (
    <ChartTable
      columns={[
        { key: "name", label: "Amino acid" },
        { key: "score", label: "Score" },
        { key: "limiting", label: "Limiting" },
      ]}
      rows={block.scores.map((s) => [
        humanizeKey(s.key),
        s.score === null ? null : formatNumber(s.score),
        s.key === block.limiting_amino_acid ? "yes" : "",
      ])}
    />
  );

  return (
    <ChartFrame
      title="Amino-acid score against the reference pattern"
      description={`Scores against ${block.reference_pattern.name}. The dashed line is the reference value of 1.0; the red bar is the limiting amino acid. This is a pattern score, not DIAAS.`}
      chart={
        <PlotlyChart
          data={data}
          layout={{
            ...plotlyLayout({
              font: colors.font,
              grid: colors.grid,
              bg: "transparent",
            }),
            yaxis: { title: { text: "score" }, gridcolor: colors.grid },
            shapes: [
              {
                type: "line",
                xref: "paper",
                x0: 0,
                x1: 1,
                yref: "y",
                y0: 1,
                y1: 1,
                line: { color: colors.destructive, width: 1, dash: "dash" },
              },
            ],
            annotations: [
              {
                xref: "paper",
                x: 1,
                yref: "y",
                y: 1,
                text: "reference 1.0",
                showarrow: false,
                font: { color: colors.destructive, size: 10 },
              },
            ],
          }}
          ariaLabel={`Bar chart of amino-acid scores against the reference pattern. Limiting amino acid: ${
            block.limiting_amino_acid
              ? humanizeKey(block.limiting_amino_acid)
              : "not determined"
          }.`}
        />
      }
      table={table}
    />
  );
}
