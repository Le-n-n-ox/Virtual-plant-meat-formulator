"use client";

import { TriangleAlertIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatNumber, humanizeKey } from "@/lib/format";
import type { TexturePrediction, TextureResult } from "@/types";

function intervalOf(p: TexturePrediction): [number, number] | null {
  const raw = p.interval as unknown;
  if (Array.isArray(raw) && raw.length === 2) {
    return [Number(raw[0]), Number(raw[1])];
  }
  if (raw && typeof raw === "object") {
    const o = raw as { lower?: number; upper?: number };
    if (typeof o.lower === "number" && typeof o.upper === "number")
      return [o.lower, o.upper];
  }
  return null;
}

/** Texture predictions. Always labelled as a literature-derived estimate. */
export function TextureResults({ result }: { result: TextureResult }) {
  return (
    <section aria-label="Texture prediction" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-medium">Texture prediction</h2>
        <Badge variant="outline" className="border-warning/60">
          Literature-derived estimate
        </Badge>
      </div>
      {result.predictions.length === 0 && (
        <p className="text-sm text-muted-foreground">
          The model returned no predictions for this formulation.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {result.predictions.map((p) => {
          const interval = intervalOf(p);
          const value = p.value as number | null;
          return (
            <li key={p.target} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{humanizeKey(p.target)}</span>
                {p.in_domain === false ? (
                  <Badge variant="destructive">
                    <TriangleAlertIcon aria-hidden /> Outside model domain
                  </Badge>
                ) : p.in_domain === true ? (
                  <Badge variant="outline">In model domain</Badge>
                ) : null}
              </div>
              <p className="mt-1 tabular-nums">
                {value === null || value === undefined ? (
                  <span className="text-muted-foreground">
                    No supported prediction
                  </span>
                ) : (
                  <>
                    <span className="text-lg font-semibold">
                      {formatNumber(value)}
                    </span>{" "}
                    {p.unit}
                    {interval && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {Math.round((p.interval_level ?? 0.9) * 100)}% interval{" "}
                        {formatNumber(interval[0])} to{" "}
                        {formatNumber(interval[1])} {p.unit}
                      </span>
                    )}
                  </>
                )}
              </p>
              {p.in_domain === false && (
                <p className="mt-1 text-xs text-destructive">
                  This formulation lies outside the data the model was trained
                  on, so treat this value with caution.
                </p>
              )}
              {p.model && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Model {p.model.algorithm} v{p.model.version}, trained on{" "}
                  {p.model.training_set_size} literature samples.
                </p>
              )}
            </li>
          );
        })}
      </ul>
      {result.warnings?.map((w, i) => (
        <p
          key={`${w.code ?? "w"}-${i}`}
          className="flex items-start gap-1 text-xs text-muted-foreground"
        >
          <TriangleAlertIcon
            className="mt-px size-3.5 shrink-0 text-warning"
            aria-hidden
          />
          {w.message}
        </p>
      ))}
    </section>
  );
}
