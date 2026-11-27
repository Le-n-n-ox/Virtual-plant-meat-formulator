"use client";

import { ChartFrame, ChartTable } from "@/components/charts/chart-frame";
import {
  chartThemeColors,
  PlotlyChart,
  plotlyLayout,
  type PlotData,
} from "@/components/charts/plotly-chart";
import { formatNumber, humanizeKey } from "@/lib/format";
import type { NutritionResult } from "@/types";

/**
 * Macronutrients that are reported in grams, so one axis can carry them all.
 * Energy is excluded: it is reported in kilojoules or kilocalories and would
 * make the axis meaningless.
 */
const MACRO_GRAM_KEYS = [
  "protein",
  "fat",
  "carbohydrate",
  "fibre",
  "moisture",
  "ash",
];

/** Macronutrient bars per 100 g, with the basis named in the description. */
export function MacroChart({ result }: { result: NutritionResult }) {
  const colors = chartThemeColors();
  const rows = result.nutrients.filter(
    (n) => MACRO_GRAM_KEYS.includes(n.key) && n.unit === "g",
  );
  if (rows.length === 0) return null;

  const data: PlotData[] = [
    {
      type: "bar",
      x: rows.map((n) => n.name ?? humanizeKey(n.key)),
      y: rows.map((n) => n.value),
      text: rows.map((n) =>
        n.value === null ? "not reported" : `${formatNumber(n.value)} g`,
      ),
      textposition: "auto",
      marker: {
        color: rows.map((n) =>
          n.value === null
            ? colors.grid
            : n.contains_estimated
              ? colors.accent
              : colors.primary,
        ),
      },
    },
  ];

  const table = (
    <ChartTable
      columns={[
        { key: "name", label: "Macronutrient" },
        { key: "value", label: "g per 100 g" },
        { key: "quality", label: "Quality" },
        { key: "note", label: "Note" },
      ]}
      rows={rows.map((n) => [
        n.name ?? humanizeKey(n.key),
        n.value === null ? null : formatNumber(n.value),
        n.flag,
        n.value === null
          ? `${n.missing_ingredient_ids?.length ?? 0} ingredient(s) have no reported value`
          : n.contains_estimated
            ? "includes estimated source values"
            : "",
      ])}
    />
  );

  return (
    <ChartFrame
      title="Macronutrients"
      description="Grams per 100 g as formulated. Green bars include estimated source values; a labelled gap means no value was reported."
      chart={
        <PlotlyChart
          data={data}
          layout={{
            ...plotlyLayout({
              font: colors.font,
              grid: colors.grid,
              bg: "transparent",
            }),
            yaxis: {
              title: { text: "grams per 100 g" },
              gridcolor: colors.grid,
            },
          }}
          ariaLabel={`Bar chart of macronutrients per 100 g: ${rows
            .map((n) =>
              n.value === null
                ? `${n.name ?? humanizeKey(n.key)} not reported`
                : `${n.name ?? humanizeKey(n.key)} ${formatNumber(n.value)} grams`,
            )
            .join(", ")}`}
        />
      }
      table={table}
    />
  );
}
