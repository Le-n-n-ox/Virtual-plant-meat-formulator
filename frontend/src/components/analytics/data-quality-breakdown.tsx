"use client";

import { ChartFrame, ChartTable } from "@/components/charts/chart-frame";
import {
  chartThemeColors,
  PlotlyChart,
  plotlyLayout,
  type PlotData,
} from "@/components/charts/plotly-chart";
import { formatNumber } from "@/lib/format";
import { AnalyticsPanel } from "./analytics-panel";
import { qualityFlagColors } from "./palette";
import {
  ENDPOINTS,
  PAGE_LIMIT,
  type DataQuality,
  useDataQuality,
} from "./queries";

/**
 * Data quality: how the catalogue's records are flagged, and how many of them
 * carry an amino-acid profile at all.
 *
 * The flag totals come from the list endpoint's `total`, so they cover every
 * active record. The amino-acid count cannot: it has to be tallied from the
 * records themselves and the endpoint returns at most one page, so the panel
 * reports it against the number of records it actually read and says so.
 */
export function DataQualityBreakdown() {
  const { data, error, loading } = useDataQuality();
  const quality = data?.value ?? null;

  return (
    <AnalyticsPanel
      title="Data quality"
      description="How many catalogue records carry an analytical flag and how many carry an estimated flag. A flag describes where a value came from, not the quality of the food."
      source={`${ENDPOINTS.ingredients} (unfiltered, flag=analytical, flag=estimated)`}
      fetchedAt={data?.fetchedAt ?? null}
      loading={loading}
      error={error}
      empty={quality !== null && quality.total === 0}
      emptyMessage="The catalogue holds no active records, so there is nothing to flag."
    >
      {quality && (
        <>
          <FlagChart quality={quality} />
          <AminoAcidCoverageChart quality={quality} />
        </>
      )}
    </AnalyticsPanel>
  );
}

function FlagChart({ quality }: { quality: DataQuality }) {
  const colors = chartThemeColors();
  const flag = qualityFlagColors();
  const total = quality.total;
  const rows = [
    {
      label: "All active records",
      count: total,
      color: flag.neutral,
    },
    {
      label: "Flagged analytical",
      count: quality.analytical,
      color: flag.analytical,
    },
    {
      label: "Flagged estimated",
      count: quality.estimated,
      color: flag.estimated,
    },
  ];
  const share = (count: number) =>
    total > 0 ? `${formatNumber((count / total) * 100)}%` : "not applicable";

  /*
   * Three independent bars, not one stacked bar. The catalogue's own filter
   * matches a record when the record, or any value on it, carries the flag, so a
   * record holding one measured and one derived value is counted in both. A
   * stack would claim the two are halves of the catalogue, which they are not.
   */
  const data: PlotData[] = [
    {
      type: "bar",
      x: rows.map((r) => r.label),
      y: rows.map((r) => r.count),
      text: rows.map((r) => formatNumber(r.count)),
      textposition: "auto",
      marker: { color: rows.map((r) => r.color) },
      hovertemplate: "%{x}: %{y} records<extra></extra>",
    },
  ];

  return (
    <ChartFrame
      title="Catalogue records by quality flag"
      description={`Counts of records against the ${formatNumber(total)} active catalogue records. The two flag counts overlap and do not add up to the total: the catalogue matches a record when the record, or any single value on it, carries that flag, so a record with both a measured and a derived value is in both counts. "Estimated" means the source derived the value rather than measuring it.`}
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
              rangemode: "tozero",
            },
          }}
          height={240}
          ariaLabel={`Bar chart of catalogue records by quality flag: ${rows
            .map((r) => `${r.label} ${r.count} records, ${share(r.count)}`)
            .join("; ")}`}
        />
      }
      table={
        <ChartTable
          columns={[
            { key: "group", label: "Group of records" },
            { key: "records", label: "Catalogue records" },
            { key: "share", label: "Share of all active records" },
          ]}
          rows={rows.map((r) => [
            r.label,
            formatNumber(r.count),
            share(r.count),
          ])}
        />
      }
    />
  );
}

function AminoAcidCoverageChart({ quality }: { quality: DataQuality }) {
  const colors = chartThemeColors();
  const flag = qualityFlagColors();
  const read = quality.sampleSize;
  const without = quality.sampleWithoutAminoAcids;
  const withProfile = Math.max(0, read - without);

  if (read === 0) {
    return (
      <p className="text-small text-muted-foreground">
        No catalogue record was returned, so no amino-acid coverage can be
        counted.
      </p>
    );
  }

  const rows = [
    {
      label: "Amino-acid profile recorded",
      count: withProfile,
      color: flag.analytical,
    },
    {
      label: "No amino-acid profile recorded",
      count: without,
      color: flag.estimated,
    },
  ];

  // The window matters more than the number: an amino-acid count taken over one
  // page of a larger catalogue must never read as a catalogue-wide figure.
  const window = quality.sampleIsWholeCatalogue
    ? `All ${formatNumber(quality.total)} active catalogue records.`
    : `Counted in the ${formatNumber(read)} records of the first page only, of ${formatNumber(quality.total)} active catalogue records; the endpoint returns at most ${PAGE_LIMIT} records per request, so this is not a catalogue-wide count.`;

  return (
    <ChartFrame
      title="Records with an amino-acid profile"
      description={`How many records carry any amino-acid value at all. A record without one cannot contribute to an amino-acid score, so a formulation built from it returns a partial score. ${window}`}
      chart={
        <PlotlyChart
          data={[
            {
              type: "bar",
              x: rows.map((r) => r.label),
              y: rows.map((r) => r.count),
              text: rows.map((r) => formatNumber(r.count)),
              textposition: "auto",
              marker: { color: rows.map((r) => r.color) },
              hovertemplate: "%{x}: %{y} records<extra></extra>",
            },
          ]}
          layout={{
            ...plotlyLayout({
              font: colors.font,
              grid: colors.grid,
              bg: "transparent",
            }),
            showlegend: false,
            yaxis: {
              title: { text: "catalogue records read" },
              gridcolor: colors.grid,
            },
          }}
          height={220}
          ariaLabel={`Bar chart of amino-acid coverage in the ${read} catalogue records read: ${rows
            .map((r) => `${r.label} ${r.count} records`)
            .join(", ")}`}
        />
      }
      table={
        <ChartTable
          columns={[
            { key: "coverage", label: "Amino-acid profile" },
            { key: "records", label: "Records read" },
            { key: "scope", label: "Scope of the count" },
          ]}
          rows={rows.map((r) => [
            r.label,
            formatNumber(r.count),
            quality.sampleIsWholeCatalogue
              ? "whole catalogue"
              : `first ${formatNumber(read)} records of ${formatNumber(quality.total)}`,
          ])}
        />
      }
    />
  );
}
