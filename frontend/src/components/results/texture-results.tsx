"use client";

import { TriangleAlertIcon } from "lucide-react";
import { ModelBadge } from "@/components/models/model-badge";
import { ModelLimitations } from "@/components/models/model-limitations";
import { TextureChart } from "@/components/results/texture-chart";
import { Badge } from "@/components/ui/badge";
import { formatNumber, humanizeKey } from "@/lib/format";
import type {
  DomainViolation,
  TexturePrediction,
  TextureResult,
} from "@/types";

import { intervalOf } from "./texture-interval";
export { intervalOf };

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

/**
 * One published-sample group in words. Each clause appears only when the
 * response actually carried it: a group with samples but no reported range
 * says so, rather than implying the range was measured as zero.
 */
export function describeEvidence(e: {
  n_samples?: number;
  measured_min?: number;
  measured_max?: number;
  unit?: string;
}): string {
  if (!e.n_samples) return "";
  const unit = e.unit ? ` ${e.unit}` : "";
  // Destructured so the undefined check narrows both bounds; a `?? 0` here is
  // what invented the measurement in the first place.
  const { measured_min: min, measured_max: max } = e;
  if (min === undefined || max === undefined) {
    return `: ${e.n_samples} samples, no measured range reported`;
  }
  return `: measured ${formatNumber(min)} to ${formatNumber(
    max,
  )}${unit} across ${e.n_samples} samples`;
}

/** Why there is no number, plus the closest published samples for comparison. */
function OutOfDomain({ p }: { p: TexturePrediction }) {
  const violations = violationsOf(p);
  const evidence = p.nearest_evidence ?? [];
  return (
    <div className="mt-1 flex flex-col gap-2 text-caption">
      <p className="text-small font-medium">Insufficient supporting evidence</p>
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
                {/*
                 * `measured_min` and `measured_max` are optional in the
                 * response. They were previously defaulted to 0, which turned
                 * a range the source never reported into "measured 0 to 0" —
                 * a fabricated measurement, and exactly what the guide's §9
                 * rule against showing missing data as zero forbids. The range
                 * is now printed only when both bounds are really there; the
                 * sample count still stands on its own.
                 */}
                {describeEvidence(e)}
                {e.source ? ` (${e.source.split(",")[0]})` : ""}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Texture predictions. Always labelled as a literature-derived estimate. */
export function TextureResults({ result }: { result: TextureResult }) {
  return (
    <section aria-label="Texture prediction" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-h4">Texture prediction</h2>
        <Badge variant="outline" className="border-warning/60">
          Literature-derived estimate
        </Badge>
      </div>
      {result.predictions.length === 0 && (
        <p className="text-small text-muted-foreground">
          The model returned no predictions for this formulation.
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {result.predictions.map((p) => {
          const interval = intervalOf(p);
          const value = p.value as number | null;
          return (
            <li key={p.target} className="rounded-lg border p-3 text-small">
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
              <p className="mt-1 font-numeric">
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
                    <span className="text-h3 font-semibold">
                      {formatNumber(value)}
                    </span>{" "}
                    {p.unit}
                    {interval && (
                      <span className="ml-2 text-caption text-muted-foreground">
                        {Math.round((p.interval_level ?? 0.9) * 100)}% interval{" "}
                        {formatNumber(interval[0])} to{" "}
                        {formatNumber(interval[1])} {p.unit}
                      </span>
                    )}
                  </>
                )}
              </p>
              {p.reason === "out_of_domain" && <OutOfDomain p={p} />}
            </li>
          );
        })}
      </ul>
      {result.warnings?.map((w, i) => (
        <p
          key={`${w.code ?? "w"}-${i}`}
          className="flex items-start gap-1 text-caption text-muted-foreground"
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

      <TextureChart result={result} />

      <ModelsUsed predictions={result.predictions} />
    </section>
  );
}

/** Model badge and limitations for every distinct model behind the result. */
function ModelsUsed({ predictions }: { predictions: TexturePrediction[] }) {
  const models = new Map<string, TexturePrediction["model"]>();
  for (const p of predictions) if (p.model) models.set(p.model.id, p.model);
  if (models.size === 0) return null;
  return (
    <section aria-label="Models used" className="flex flex-col gap-2">
      <h3 className="text-h4">Model provenance</h3>
      {[...models.values()].map((m) => (
        <div key={m.id} className="flex flex-col gap-1.5">
          <ModelBadge model={m} />
          <ModelLimitations modelId={m.id} />
        </div>
      ))}
    </section>
  );
}
