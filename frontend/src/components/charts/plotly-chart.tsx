"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Plotly is ~1 MB, so it is loaded on demand in the browser only. Every chart
 * built on this component must be given a data-table alternative by its caller
 * (see `ChartFrame`).
 */
const Plot = dynamic(() => import("react-plotly.js"), {
  ssr: false,
  loading: () => (
    <Skeleton className="h-72 w-full" aria-label="Loading chart" />
  ),
});

export type PlotData = Record<string, unknown>;

export interface PlotlyChartProps {
  data: PlotData[];
  layout?: PlotData;
  config?: PlotData;
  /** Accessible description of the chart, used as the image's alt text. */
  ariaLabel: string;
  /** Fixed pixel height; Plotly resizes horizontally. */
  height?: number;
}

export function PlotlyChart({
  data,
  layout,
  config,
  ariaLabel,
  height = 288,
}: PlotlyChartProps) {
  return (
    <div
      role="img"
      aria-label={ariaLabel}
      className="w-full"
      style={{ minHeight: height }}
    >
      <Plot
        data={data as never}
        layout={{ autosize: true, ...layout } as never}
        config={{ responsive: true, displaylogo: false, ...config } as never}
        style={{ width: "100%", height: `${height}px` }}
        useResizeHandler
      />
    </div>
  );
}

/** Plotly colours that follow the theme tokens instead of a hardcoded palette. */
export function plotlyLayout(colors: {
  font: string;
  grid: string;
  bg: string;
}): Record<string, unknown> {
  return {
    paper_bgcolor: "rgba(0,0,0,0)",
    plot_bgcolor: "rgba(0,0,0,0)",
    font: { color: colors.font, size: 12 },
    margin: { t: 16, r: 16, b: 40, l: 56 },
    xaxis: { gridcolor: colors.grid, zerolinecolor: colors.grid },
    yaxis: { gridcolor: colors.grid, zerolinecolor: colors.grid },
    showlegend: true,
    legend: { orientation: "h", y: -0.2 },
  };
}

const FALLBACK = {
  font: "#8a8a8a",
  grid: "#d8d8d8",
  primary: "#2f6fbd",
  accent: "#2f855a",
  destructive: "#c0392b",
};

/** Reads the CSS custom properties Plotly needs, so charts follow the theme. */
export function chartThemeColors() {
  if (typeof window === "undefined") return FALLBACK;
  const read = (name: string, fallback: string) => {
    const value = getComputedStyle(document.documentElement)
      .getPropertyValue(name)
      .trim();
    return value || fallback;
  };
  return {
    font: read("--muted-foreground", FALLBACK.font),
    grid: read("--border", FALLBACK.grid),
    primary: read("--primary", FALLBACK.primary),
    accent: read("--success", FALLBACK.accent),
    destructive: read("--destructive", FALLBACK.destructive),
  };
}
