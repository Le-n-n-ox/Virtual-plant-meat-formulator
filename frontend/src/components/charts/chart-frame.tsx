"use client";

import { useState, type ReactNode } from "react";
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
    <table className="w-full min-w-[320px] text-xs">
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
              <td key={j} className="px-2 py-1 tabular-nums">
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
  return (
    <figure
      className={cn("flex flex-col gap-2 rounded-lg border p-3", className)}
    >
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-medium">{title}</h3>
        <button
          type="button"
          aria-expanded={showTable}
          onClick={() => setShowTable((v) => !v)}
          className="text-xs text-primary underline underline-offset-4"
        >
          {showTable ? "Hide data table" : "Show data table"}
        </button>
      </figcaption>
      {description && (
        <p className="text-xs text-muted-foreground">{description}</p>
      )}
      <div className="h-72">{chart}</div>
      {showTable && (
        <div className="max-h-72 overflow-auto rounded-lg border bg-background p-2">
          {table}
        </div>
      )}
    </figure>
  );
}
