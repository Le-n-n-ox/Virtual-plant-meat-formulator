"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { useMotion } from "@/lib/motion";
import { cn } from "@/lib/utils";

export interface ChartTableColumn {
  key: string;
  label: string;
}

/**
 * The accessible, non-visual form of a chart. Every chart rendered through
 * `ChartFrame` must be paired with one of these.
 */
export function ChartTable({
  columns,
  rows,
}: {
  columns: ChartTableColumn[];
  rows: (string | number | null)[][];
}) {
  return (
    <table className="w-full min-w-[320px] text-caption">
      <caption className="sr-only">
        Data table alternative for the accompanying chart
      </caption>
      <thead className="text-left text-muted-foreground">
        <tr>
          {columns.map((c) => (
            <th key={c.key} className="border-b px-2 py-1 font-medium">
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className="border-t">
            {row.map((cell, j) => (
              <td key={j} className="px-2 py-1 font-numeric">
                {cell === null || cell === undefined || cell === ""
                  ? "not reported"
                  : cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export interface ChartFrameProps {
  title: string;
  description?: string;
  /** The lazy-loaded chart. */
  chart: ReactNode;
  /** The same values as a table. */
  table: ReactNode;
  className?: string;
}

/**
 * A figure with a chart and a toggleable data table, so the visualisation is
 * never the only way to read the numbers.
 */
export function ChartFrame({
  title,
  description,
  chart,
  table,
  className,
}: ChartFrameProps) {
  const [showTable, setShowTable] = useState(false);
  const motionTokens = useMotion();
  return (
    <figure
      className={cn(
        // The edge matches the Card primitive's `outline` variant — a ring
        // rather than a border — so a chart frame and a card sitting on the
        // same page do not draw visibly different edges.
        "flex flex-col gap-2 rounded-lg p-3 ring-1 ring-foreground/10",
        className,
      )}
    >
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-h4">{title}</h3>
        <button
          type="button"
          aria-expanded={showTable}
          onClick={() => setShowTable((v) => !v)}
          className="text-caption text-primary underline underline-offset-4"
        >
          {showTable ? "Hide data table" : "Show data table"}
        </button>
      </figcaption>
      {description && (
        <p className="text-caption text-muted-foreground">{description}</p>
      )}
      {/*
       * Plotly arrives late, so the chart fades and rises into its slot once
       * instead of replacing the skeleton in a jump. It plays a single time:
       * nothing here repeats and nothing about the movement says a figure is
       * still being computed. With reduced motion the chart is simply drawn
       * where it belongs.
       */}
      <motion.div
        className="h-72"
        initial={motionTokens.reduced ? false : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={motionTokens.enter}
      >
        {chart}
      </motion.div>
      <AnimatePresence initial={false}>
        {showTable && (
          <motion.div
            className="overflow-hidden"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={motionTokens.enter}
          >
            <div className="max-h-72 overflow-auto rounded-lg border bg-background p-2">
              {table}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </figure>
  );
}
