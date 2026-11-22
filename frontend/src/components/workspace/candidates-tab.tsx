"use client";

import {
  BoxIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  GitCompareIcon,
  TriangleAlertIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, useState } from "react";
import { ExplainPanel } from "@/components/assistant/explain-panel";
import { ModelBadge } from "@/components/models/model-badge";
import { intervalOf } from "@/components/results/texture-results";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import { useIngredientNames } from "@/hooks/use-ingredient-names";
import { useSavedVersion } from "@/hooks/use-saved-version";
import { listCandidates, promoteCandidate } from "@/lib/api/candidates";
import { listJobs } from "@/lib/api/jobs";
import {
  errorMessage,
  formatDateTime,
  formatNumber,
  humanizeKey,
  NOT_REPORTED,
} from "@/lib/format";
import { useInvalidateResource } from "@/lib/query/invalidate";
import { useSelectionStore } from "@/stores/selectionStore";
import type { Candidate, TexturePrediction } from "@/types";

const KNOWN_METRICS = new Set([
  "protein_g_per_100g",
  "amino_acid_score",
  "amino_acid_method",
  "limiting_amino_acid",
  "cost_per_kg",
]);

export function metricNumber(c: Candidate, key: string): number | null {
  const v = c.metrics[key];
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export function costOf(
  c: Candidate,
): { value: number; currency: string } | null {
  const v = c.metrics.cost_per_kg;
  if (v && typeof v === "object") {
    const o = v as { value?: unknown; currency?: unknown };
    if (typeof o.value === "number")
      return {
        value: o.value,
        currency: typeof o.currency === "string" ? o.currency : "",
      };
  }
  return null;
}

export function CandidatesTab() {
  const { id, loadState } = useSavedVersion();
  const router = useRouter();
  const invalidate = useInvalidateResource();
  const search = useSearchParams();
  const jobId = search.get("job_id") ?? "";
  const [paretoOnly, setParetoOnly] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [promoteError, setPromoteError] = useState<string | null>(null);

  const jobs = useApiQuery(
    ["jobs", { formulation_id: id, type: "optimization" }],
    () =>
      listJobs({
        formulation_id: id,
        type: "optimization",
        status: ["completed", "cancelled", "failed"],
        page_size: 50,
      }),
  );
  const candidates = useApiQuery(
    ["candidates", { formulationId: id, jobId, paretoOnly }],
    () =>
      listCandidates(id, {
        job_id: jobId || undefined,
        pareto: paretoOnly || undefined,
        page_size: 100,
      }),
  );
  const items = candidates.data?.items ?? [];
  const nameOf = useIngredientNames(
    items.flatMap((c) => c.lines.map((l) => l.ingredient_id)),
  );

  function setJob(value: string) {
    setSelected([]);
    setExpanded(null);
    router.replace(
      value
        ? `/formulations/${id}/candidates?job_id=${encodeURIComponent(value)}`
        : `/formulations/${id}/candidates`,
    );
  }

  function toggle(candidateId: string) {
    setSelected((cur) =>
      cur.includes(candidateId)
        ? cur.filter((x) => x !== candidateId)
        : cur.length < 2
          ? [...cur, candidateId]
          : cur,
    );
  }

  async function promote(candidateId: string) {
    setPromoting(candidateId);
    setPromoteError(null);
    try {
      const created = await promoteCandidate(candidateId);
      invalidate("candidates");
      invalidate("formulations");
      router.push(`/formulations/${created.id}`);
    } catch (error) {
      setPromoteError(errorMessage(error));
      setPromoting(null);
    }
  }

  if (loadState === "loading" || loadState === "idle")
    return <Skeleton className="h-48 w-full" />;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Candidates</h1>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          Optimization job
          <select
            aria-label="Filter by optimization job"
            value={jobId}
            onChange={(e) => setJob(e.target.value)}
            className="h-8 max-w-56 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
          >
            <option value="">All jobs</option>
            {jobId && !jobs.data?.items.some((j) => j.id === jobId) && (
              <option value={jobId}>{jobId}</option>
            )}
            {jobs.data?.items.map((j) => (
              <option key={j.id} value={j.id}>
                v{j.formulation.version} · {formatDateTime(j.created_at)} ·{" "}
                {j.status}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={paretoOnly}
            onChange={(e) => setParetoOnly(e.target.checked)}
          />
          Pareto only
        </label>
        <Button
          size="sm"
          disabled={selected.length !== 2}
          onClick={() => router.push(`/compare?ids=${selected.join(",")}`)}
        >
          <GitCompareIcon aria-hidden /> Compare{" "}
          {selected.length > 0 ? `(${selected.length}/2)` : ""}
        </Button>
      </div>

      {promoteError && (
        <p role="alert" className="text-sm text-destructive">
          {promoteError}
        </p>
      )}
      {candidates.loading && <Skeleton className="h-40 w-full" />}
      {candidates.error && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(candidates.error)}
        </p>
      )}
      {!candidates.loading && !candidates.error && items.length === 0 && (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm">
          <p className="font-medium">No candidates</p>
          <p className="mt-1 text-muted-foreground">
            Run an optimization from the{" "}
            <Link
              href={`/formulations/${id}/optimize`}
              className="text-primary underline underline-offset-4"
            >
              Optimize tab
            </Link>{" "}
            to generate candidate formulations.
          </p>
        </div>
      )}

      {items.length > 0 && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[560px] text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-8 p-2">
                  <span className="sr-only">Select</span>
                </th>
                <th className="p-2 font-medium">Rank</th>
                <th className="p-2 font-medium">Ingredients</th>
                <th className="p-2 font-medium">Nutrition and cost</th>
                <th className="p-2 font-medium">
                  Texture (literature-derived estimate)
                </th>
                <th className="w-8 p-2">
                  <span className="sr-only">Details</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => {
                const open = expanded === c.id;
                const cost = costOf(c);
                const protein = metricNumber(c, "protein_g_per_100g");
                const aas = metricNumber(c, "amino_acid_score");
                const limiting = c.metrics.limiting_amino_acid;
                return (
                  <Fragment key={c.id}>
                    <tr className="border-t align-top">
                      <td className="p-2">
                        <input
                          type="checkbox"
                          aria-label={`Select candidate rank ${c.rank} for comparison`}
                          checked={selected.includes(c.id)}
                          disabled={
                            !selected.includes(c.id) && selected.length >= 2
                          }
                          onChange={() => toggle(c.id)}
                        />
                      </td>
                      <td className="p-2">
                        <div className="flex flex-col items-start gap-1">
                          <span className="font-medium tabular-nums">
                            #{c.rank}
                          </span>
                          {c.pareto && <Badge>Pareto</Badge>}
                          {c.from_cancelled_job && (
                            <Badge variant="outline">From cancelled job</Badge>
                          )}
                          {c.scene.visual_basis === "illustrative" && (
                            <Badge variant="secondary">
                              Illustrative visual
                            </Badge>
                          )}
                          {(c.warnings?.length ?? 0) > 0 && (
                            <Badge
                              variant="outline"
                              className="border-warning/60"
                            >
                              <TriangleAlertIcon aria-hidden />
                              {c.warnings?.length} warning
                              {c.warnings?.length === 1 ? "" : "s"}
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="p-2">
                        <ul className="text-xs">
                          {c.lines.map((l) => (
                            <li key={l.ingredient_id}>
                              {nameOf(l.ingredient_id)}{" "}
                              <span className="tabular-nums text-muted-foreground">
                                {formatNumber(l.percent)}%
                              </span>
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="p-2 text-xs">
                        <dl className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5">
                          <dt className="text-muted-foreground">Protein</dt>
                          <dd className="tabular-nums">
                            {protein === null
                              ? NOT_REPORTED
                              : `${formatNumber(protein)} g/100 g`}
                          </dd>
                          <dt className="text-muted-foreground">AAS</dt>
                          <dd className="tabular-nums">
                            {aas === null ? "missing" : formatNumber(aas)}
                            {typeof limiting === "string" && limiting
                              ? ` (limiting: ${humanizeKey(limiting)})`
                              : ""}
                          </dd>
                          <dt className="text-muted-foreground">Cost</dt>
                          <dd className="tabular-nums">
                            {cost
                              ? `${formatNumber(cost.value)} ${cost.currency}/kg`
                              : NOT_REPORTED}
                          </dd>
                        </dl>
                      </td>
                      <td className="p-2 text-xs">
                        {c.predictions.length === 0 ? (
                          <span className="text-muted-foreground">
                            none requested
                          </span>
                        ) : (
                          <ul className="flex flex-col gap-1.5">
                            {c.predictions.map((p) => (
                              <PredictionLine key={p.target} p={p} />
                            ))}
                          </ul>
                        )}
                      </td>
                      <td className="p-2">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          aria-expanded={open}
                          aria-label={`${open ? "Hide" : "Show"} details for rank ${c.rank}`}
                          onClick={() => setExpanded(open ? null : c.id)}
                        >
                          {open ? <ChevronDownIcon /> : <ChevronRightIcon />}
                        </Button>
                      </td>
                    </tr>
                    {open && (
                      <tr className="border-t bg-muted/20">
                        <td colSpan={6} className="p-3">
                          <CandidateDetail
                            candidate={c}
                            promoting={promoting === c.id}
                            onPromote={() => void promote(c.id)}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {candidates.data && candidates.data.total > items.length && (
        <p className="text-xs text-muted-foreground">
          Showing {items.length} of {candidates.data.total} candidates.
        </p>
      )}
    </div>
  );
}

export function PredictionLine({ p }: { p: TexturePrediction }) {
  const interval = intervalOf(p);
  const value = p.value as number | null | undefined;
  return (
    <li>
      <span className="font-medium">{humanizeKey(p.target)}</span>{" "}
      {value === null || value === undefined ? (
        <span className="text-muted-foreground">no supported estimate</span>
      ) : (
        <span className="tabular-nums">
          {formatNumber(value)} {p.unit}
          {interval && (
            <span className="text-muted-foreground">
              {" "}
              ({Math.round((p.interval_level ?? 0.9) * 100)}% interval{" "}
              {formatNumber(interval[0])} to {formatNumber(interval[1])})
            </span>
          )}
        </span>
      )}{" "}
      {p.in_domain === false ? (
        <Badge variant="destructive">Out of domain</Badge>
      ) : p.in_domain === true ? (
        <Badge variant="outline">In domain</Badge>
      ) : null}
    </li>
  );
}

function CandidateDetail({
  candidate: c,
  promoting,
  onPromote,
}: {
  candidate: Candidate;
  promoting: boolean;
  onPromote: () => void;
}) {
  const extraMetrics = Object.entries(c.metrics).filter(
    ([k, v]) =>
      !KNOWN_METRICS.has(k) &&
      !c.predictions.some((p) => p.target === k) &&
      typeof v === "number",
  );
  const selectCandidate = useSelectionStore((s) => s.selectCandidate);
  const models = new Map<string, TexturePrediction["model"]>();
  for (const p of c.predictions) if (p.model) models.set(p.model.id, p.model);
  const canCutaway =
    c.scene.visual_basis !== "illustrative" ||
    c.scene.variables.some((v) => v.validated);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={promoting} onClick={onPromote}>
          {promoting ? "Promoting…" : "Promote to formulation"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => selectCandidate(c.id, c.scene)}
        >
          <BoxIcon aria-hidden /> Preview in 3D
        </Button>
        {c.promoted_formulation_id && (
          <Link
            href={`/formulations/${c.promoted_formulation_id}`}
            className="text-xs text-primary underline underline-offset-4"
          >
            Already promoted: open formulation
          </Link>
        )}
        <Badge variant="secondary">
          {c.scene.visual_basis === "illustrative"
            ? "Illustrative visual, not a calibrated model"
            : `Visual basis: ${c.scene.visual_basis}`}
        </Badge>
      </div>
      {extraMetrics.length > 0 && (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
          {extraMetrics.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted-foreground">{humanizeKey(k)}</dt>
              <dd className="tabular-nums">{formatNumber(v as number)}</dd>
            </div>
          ))}
        </dl>
      )}
      {(c.warnings?.length ?? 0) > 0 && (
        <ul className="flex flex-col gap-1 text-xs">
          {c.warnings?.map((w, i) => (
            <li key={i} className="flex items-start gap-1">
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
            </li>
          ))}
        </ul>
      )}

      {models.size > 0 && (
        <div className="flex flex-col gap-1.5">
          <h4 className="text-xs font-medium text-muted-foreground">
            Models behind these estimates
          </h4>
          {[...models.values()].map((m) => (
            <ModelBadge key={m.id} model={m} />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        {canCutaway
          ? "This candidate carries a validated scene variable, so a cutaway view is available in the 3D scene."
          : "The 3D visual is illustrative: no calibrated, validated variable is attached to this candidate."}
      </p>

      <ExplainPanel
        target={{ kind: "candidate", id: c.id }}
        label="Explain this candidate"
      />
    </div>
  );
}
