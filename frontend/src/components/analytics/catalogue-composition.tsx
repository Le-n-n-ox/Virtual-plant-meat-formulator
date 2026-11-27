"use client";

import { ChartFrame, ChartTable } from "@/components/charts/chart-frame";
import {
  chartThemeColors,
  PlotlyChart,
  plotlyLayout,
  type PlotData,
} from "@/components/charts/plotly-chart";
import { formatNumber, humanizeKey } from "@/lib/format";
import type { FacetEntry } from "@/types";
import { AnalyticsPanel } from "./analytics-panel";
import { seriesColors } from "./palette";
import { ENDPOINTS, useCatalogueFacets } from "./queries";

/**
 * How many crops the bar chart draws. A catalogue of indigenous crops has a long
 * tail of one-record crops that would make the axis illegible, so the chart
 * shows the largest few and the data table below it lists every one — the table
 * is the complete answer, the chart is the shape of it.
 */
const CROPS_IN_CHART = 12;

/** Facet labels come back as `value`, or as `id`/`name` for a data source. */
function label(entry: FacetEntry): string {
  const raw = entry.value ?? entry.name ?? entry.id;
  return raw ? humanizeKey(raw) : "not recorded";
}

function byCountDescending(entries: FacetEntry[]): FacetEntry[] {
  return [...entries].sort((a, b) => b.count - a.count);
}

function share(count: number, total: number): string {
  if (total <= 0) return "not applicable";
  return `${formatNumber((count / total) * 100)}%`;
}

/**
 * Catalogue composition: the crop and ingredient-form breakdown the catalogue's
 * own filter facets already report.
 *
 * Every number here is a count of catalogue records. A crop with 40 records is
 * not a crop with more protein or a better-studied crop; it is a crop the
 * sources happen to describe in 40 rows.
 */
export function CatalogueComposition() {
  const { data, error, loading } = useCatalogueFacets();
  const facets = data?.value ?? null;
  const crops = byCountDescending(facets?.crops ?? []);
  const forms = byCountDescending(facets?.forms ?? []);
  const cropRecords = crops.reduce((sum, c) => sum + c.count, 0);
  const formRecords = forms.reduce((sum, f) => sum + f.count, 0);

  return (
    <AnalyticsPanel
      title="Catalogue composition"
      description="How many catalogue records carry each crop and each ingredient form. These are counts of records in the ingredient catalogue, not nutritional findings about the crops."
      source={ENDPOINTS.facets}
      fetchedAt={data?.fetchedAt ?? null}
      loading={loading}
      error={error}
      empty={crops.length === 0 && forms.length === 0}
      emptyMessage="The catalogue reports no crop or form facets yet, so there are no records to count."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <CropChart
          crops={crops}
          total={cropRecords}
          shownInChart={CROPS_IN_CHART}
        />
        <FormChart forms={forms} total={formRecords} />
      </div>
      <p className="text-small text-muted-foreground">
        A record with no crop recorded is left out of the crop facet by the
        catalogue, so the two charts can count different numbers of records:{" "}
        <span className="font-numeric">{formatNumber(cropRecords)}</span> with a
        crop and{" "}
        <span className="font-numeric">{formatNumber(formRecords)}</span> with a
        form.
      </p>
    </AnalyticsPanel>
  );
}

function CropChart({
  crops,
  total,
  shownInChart,
}: {
  crops: FacetEntry[];
  total: number;
  shownInChart: number;
}) {
  const colors = chartThemeColors();
  if (crops.length === 0) {
    return (
      <p className="text-small text-muted-foreground">
        No crop is recorded on any catalogue record.
      </p>
    );
  }

  const top = crops.slice(0, shownInChart);
  const data: PlotData[] = [
    {
      type: "bar",
      orientation: "h",
      // Plotly draws the first category at the bottom, so the largest count
      // reads at the top of the chart.
      y: [...top].reverse().map(label),
      x: [...top].reverse().map((c) => c.count),
      text: [...top].reverse().map((c) => formatNumber(c.count)),
      textposition: "auto",
      marker: { color: colors.primary },
      hovertemplate: "%{y}: %{x} records<extra></extra>",
    },
  ];

  return (
    <ChartFrame
      title="Records per crop"
      description={
        crops.length > shownInChart
          ? `The ${shownInChart} crops with the most records, of ${formatNumber(crops.length)} crops in the catalogue. The data table lists every crop.`
          : `All ${formatNumber(crops.length)} crops in the catalogue, by record count.`
      }
      chart={
        <PlotlyChart
          data={data}
          layout={{
            ...plotlyLayout({
              font: colors.font,
              grid: colors.grid,
              bg: "transparent",
            }),
            showlegend: false,
            margin: { t: 8, r: 16, b: 40, l: 140 },
            xaxis: {
              title: { text: "catalogue records" },
              gridcolor: colors.grid,
            },
          }}
          ariaLabel={`Bar chart of catalogue records per crop: ${top
            .map((c) => `${label(c)} ${c.count} records`)
            .join(", ")}`}
        />
      }
      table={
        <ChartTable
          columns={[
            { key: "crop", label: "Crop" },
            { key: "records", label: "Catalogue records" },
            { key: "share", label: "Share of records with a crop" },
          ]}
          rows={crops.map((c) => [
            label(c),
            formatNumber(c.count),
            share(c.count, total),
          ])}
        />
      }
    />
  );
}

function FormChart({ forms, total }: { forms: FacetEntry[]; total: number }) {
  const colors = chartThemeColors();
  if (forms.length === 0) {
    return (
      <p className="text-small text-muted-foreground">
        No ingredient form is recorded on any catalogue record.
      </p>
    );
  }

  const data: PlotData[] = [
    {
      type: "bar",
      x: forms.map(label),
      y: forms.map((f) => f.count),
      text: forms.map((f) => formatNumber(f.count)),
      textposition: "auto",
      marker: { color: seriesColors(forms.length) },
      hovertemplate: "%{x}: %{y} records<extra></extra>",
    },
  ];

  return (
    <ChartFrame
      title="Records per ingredient form"
      description="Raw, cooked, soaked, fermented, roasted or flour, as the source recorded it. A form with more records is simply better covered by the sources."
      chart={
        <PlotlyChart
          data={data}
          layout={{
            ...plotlyLayout({
              font: colors.font,
              grid: colors.grid,
              bg: "transparent",
            }),
            showlegend: false,
            yaxis: {
              title: { text: "catalogue records" },
              gridcolor: colors.grid,
            },
          }}
          ariaLabel={`Bar chart of catalogue records per ingredient form: ${forms
            .map((f) => `${label(f)} ${f.count} records`)
            .join(", ")}`}
        />
      }
      table={
        <ChartTable
          columns={[
            { key: "form", label: "Ingredient form" },
            { key: "records", label: "Catalogue records" },
            { key: "share", label: "Share of records with a form" },
          ]}
          rows={forms.map((f) => [
            label(f),
            formatNumber(f.count),
            share(f.count, total),
          ])}
        />
      }
    />
  );
}
