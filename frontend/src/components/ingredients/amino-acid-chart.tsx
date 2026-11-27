"use client";

import { ChartFrame, ChartTable } from "@/components/charts/chart-frame";
import {
  chartThemeColors,
  PlotlyChart,
  plotlyLayout,
  type PlotData,
} from "@/components/charts/plotly-chart";
import { formatNumber, humanizeKey, NOT_REPORTED } from "@/lib/format";
import type { NutrientValue } from "@/types";

/**
 * Amino-acid profile of one ingredient, as bars. An acid with no reported value
 * is drawn as a labelled gap rather than a zero-height bar, because zero would
 * mean "none present" rather than "not measured".
 */
export function AminoAcidChart({
  aminoAcids,
}: {
  aminoAcids: NutrientValue[];
}) {
  const colors = chartThemeColors();
  if (aminoAcids.length === 0) return null;

  const data: PlotData[] = [
    {
      type: "bar",
      x: aminoAcids.map((a) => a.name ?? humanizeKey(a.key)),
      y: aminoAcids.map((a) => a.value),
      text: aminoAcids.map((a) =>
        a.value === null ? NOT_REPORTED : `${formatNumber(a.value)} ${a.unit}`,
      ),
      textposition: "auto",
      marker: {
        color: aminoAcids.map((a) =>
          a.value === null ? colors.grid : colors.primary,
        ),
      },
    },
  ];

  const table = (
    <ChartTable
      columns={[
        { key: "name", label: "Amino acid" },
        { key: "value", label: "Value" },
        { key: "unit", label: "Unit" },
        { key: "quality", label: "Quality" },
        { key: "note", label: "Note" },
      ]}
      rows={aminoAcids.map((a) => [
        a.name ?? humanizeKey(a.key),
        a.value === null ? null : formatNumber(a.value),
        a.unit,
        a.flag,
        a.reason ?? "",
      ])}
    />
  );

  return (
    <ChartFrame
      title="Amino-acid profile"
      description="Bars are the reported amount of each amino acid. A labelled gap means no value was reported, not that the acid is absent."
      chart={
        <PlotlyChart
          data={data}
          layout={plotlyLayout({
            font: colors.font,
            grid: colors.grid,
            bg: "transparent",
          })}
          ariaLabel={`Bar chart of the amino-acid profile: ${aminoAcids
            .map((a) =>
              a.value === null
                ? `${a.name ?? humanizeKey(a.key)} not reported`
                : `${a.name ?? humanizeKey(a.key)} ${formatNumber(a.value)} ${a.unit}`,
            )
            .join(", ")}`}
        />
      }
      table={table}
    />
  );
}
