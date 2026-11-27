"use client";

import { chartThemeColors } from "@/components/charts/plotly-chart";
import type { JobStatus } from "@/types";

/**
 * Theme colours for the breakdown charts on the Analytics page.
 *
 * `chartThemeColors()` exposes the single-series colours a result chart needs
 * (one primary, one accent, one destructive). The charts here draw several
 * categories at once — crops, forms, job outcomes, model statuses — so they also
 * need the `--chart-1` to `--chart-5` series tokens and the status tokens. Those
 * are read here rather than added to the shared chart module, which another
 * change owns; the fallbacks come from `chartThemeColors()` so no colour on this
 * page is written as a literal.
 */
function cssToken(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

/** The five categorical series tokens, in order, for a breakdown by category. */
export function seriesPalette(): string[] {
  const base = chartThemeColors();
  const fallbacks = [
    base.primary,
    base.accent,
    base.font,
    base.destructive,
    base.grid,
  ];
  return fallbacks.map((fallback, i) => cssToken(`--chart-${i + 1}`, fallback));
}

/** A colour per category, cycling the series palette for long breakdowns. */
export function seriesColors(count: number): string[] {
  const palette = seriesPalette();
  return Array.from({ length: count }, (_, i) => palette[i % palette.length]);
}

/**
 * Job and model status colours, taken from the same tokens the status chips use
 * so a bar and its chip agree. Colour is never the only cue (guide §9): every
 * series here is named in the legend and repeated in the data table.
 */
export function jobStatusColors(): Record<JobStatus, string> {
  const base = chartThemeColors();
  return {
    completed: cssToken("--success", base.accent),
    running: cssToken("--info", base.primary),
    queued: cssToken("--muted-foreground", base.font),
    failed: cssToken("--destructive", base.destructive),
    cancelled: cssToken("--border", base.grid),
  };
}

/**
 * Data-quality colours. Estimated takes the warning token the dashboard's
 * data-quality notice already uses, and the catalogue total takes the neutral
 * border token so it does not read as a third quality flag.
 */
export function qualityFlagColors(): {
  analytical: string;
  estimated: string;
  neutral: string;
} {
  const base = chartThemeColors();
  return {
    analytical: cssToken("--success", base.accent),
    estimated: cssToken("--warning", base.primary),
    neutral: cssToken("--border", base.grid),
  };
}

/** Model lifecycle colours, for the coverage chart's stacked series. */
export function modelStatusColor(status: string): string {
  const base = chartThemeColors();
  if (status === "approved") return cssToken("--success", base.accent);
  if (status === "retired") return cssToken("--border", base.grid);
  return cssToken("--warning", base.primary);
}
