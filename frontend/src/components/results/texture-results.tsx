"use client";

import { TriangleAlertIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatNumber, humanizeKey } from "@/lib/format";
import type {
  DomainViolation,
  TexturePrediction,
  TextureResult,
} from "@/types";

const FEATURE_LABELS: Record<string, string> = {
  protein: "protein",
  moisture: "ingredient moisture",
  ash: "ash",
  carbs: "carbohydrate",
  fat: "fat",
  fiber: "fibre",
  target_moisture: "process moisture",
};

function violationsOf(p: TexturePrediction): DomainViolation[] {
  const raw = (p.domain as { violations?: unknown } | undefined)?.violations;
  return Array.isArray(raw) ? (raw as DomainViolation[]) : [];
}

/** Why there is no number, plus the closest published samples for comparison. */
function OutOfDomain({ p }: { p: TexturePrediction }) {
  const violations = violationsOf(p);
  const evidence = p.nearest_evidence ?? [];
  return (
    <div className="mt-1 flex flex-col gap-2 text-xs">
      <p className="text-sm font-medium">Insufficient supporting evidence</p>
      <p className="text-muted-foreground">
        This blend is outside the range of the published samples the model was
        trained on, so no estimate is given. The model only supports blends
        built mainly from protein isolates or concentrates.
      </p>
      {violations.length > 0 && (
        <ul className="list-disc pl-4">
          {violations.map((v) => (
            <li key={v.feature}>
              {FEATURE_LABELS[v.feature] ?? humanizeKey(v.feature)}{" "}
              {formatNumber(v.value)} is outside the supported range{" "}
              {formatNumber(v.min)} to {formatNumber(v.max)}
            </li>
          ))}
        </ul>
      )}
      {evidence.length > 0 && (
        <div>
          <p className="font-medium">
            Nearest published samples (for comparison only, not a prediction)
          </p>
          <ul className="list-disc pl-4 text-muted-foreground">
            {evidence.map((e) => (
              <li key={e.group}>
                {e.group}
                {e.n_samples
                  ? `: measured ${formatNumber(e.measured_min ?? 0)} to ${formatNumber(
                      e.measured_max ?? 0,
                    )} ${e.unit ?? ""} across ${e.n_samples} samples`
                  : ""}
                {e.source ? ` (${e.source.split(",")[0]})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function intervalOf(p: TexturePrediction): [number, number] | null {
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
                {p.reason === "out_of_domain" ? null : value === null ||
                  value === undefined ? (
                  <span className="text-muted-foreground">
                    No supported prediction
                    {p.reason ? ` (${humanizeKey(p.reason).toLowerCase()}` : ""}
                    {p.missing_features?.length
                      ? `: ${p.missing_features.join(", ")}`
                      : ""}
                    {p.reason ? ")" : ""}
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
              {p.reason === "out_of_domain" && <OutOfDomain p={p} />}
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
          <span>
            {w.code && (
              <Badge variant="outline" className="mr-1.5">
                {humanizeKey(w.code)}
              </Badge>
            )}
            {w.message}
          </span>
        </p>
      ))}
    </section>
  );
}
