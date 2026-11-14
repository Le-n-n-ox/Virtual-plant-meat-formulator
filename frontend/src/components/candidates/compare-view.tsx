"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  PredictionLine,
  costOf,
  metricNumber,
} from "@/components/workspace/candidates-tab";
import { useApiQuery } from "@/hooks/use-api-query";
import { useIngredientNames } from "@/hooks/use-ingredient-names";
import { compareCandidates } from "@/lib/api/candidates";
import {
  errorMessage,
  formatNumber,
  humanizeKey,
  NOT_REPORTED,
} from "@/lib/format";
import type { Candidate } from "@/types";

function cell(value: number | string | null, percent: boolean): string {
  if (value === null || value === undefined)
    return percent ? "not used" : "not reported";
  return typeof value === "number" ? formatNumber(value) : value;
}

export function CompareView() {
  const search = useSearchParams();
  const raw = search.get("ids");
  const ids = (raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const valid = ids.length === 2 && ids[0] !== ids[1];
  const { data, error, loading } = useApiQuery(
    `compare|${ids.join(",")}`,
    () => compareCandidates(ids[0], ids[1]),
    valid,
  );

  const nameOf = useIngredientNames([
    ...(data?.items.flatMap((c) => c.lines.map((l) => l.ingredient_id)) ?? []),
    ...(data?.differences
      .filter((d) => d.metric.startsWith("percent:"))
      .map((d) => d.metric.slice("percent:".length)) ?? []),
  ]);

  function metricLabel(metric: string): string {
    if (metric.startsWith("percent:"))
      return `${nameOf(metric.slice("percent:".length))} (share of mass)`;
    if (metric === "cost_per_kg.value") return "Cost per kg";
    if (metric === "amino_acid_score") return "Amino acid score (AAS)";
    if (metric === "protein_g_per_100g") return "Protein";
    return `${humanizeKey(metric)} (literature-derived estimate)`;
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Compare candidates
        </h1>
        <p className="text-sm text-muted-foreground">
          Side-by-side view of two optimizer candidates.
        </p>
      </header>

      {!raw && (
        <div className="rounded-lg border border-dashed p-6 text-sm">
          <p className="font-medium">No candidates selected</p>
          <p className="mt-1 text-muted-foreground">
            Open a formulation, go to its Candidates tab, tick two candidates
            and press Compare. You can also browse formulations from the{" "}
            <Link
              href="/formulations"
              className="text-primary underline-offset-4 hover:underline"
            >
              formulations list
            </Link>
            .
          </p>
        </div>
      )}
      {raw !== null && !valid && (
        <p role="alert" className="text-sm text-destructive">
          Comparison needs exactly two different candidates; got{" "}
          {ids.length === 2 ? "the same candidate twice" : ids.length}. Pick two
          on a formulation&apos;s Candidates tab.
        </p>
      )}
      {valid && loading && <Skeleton className="h-64 w-full" />}
      {valid && error && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(error)}
        </p>
      )}

      {data && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {data.items.map((c, i) => (
              <CandidateColumn
                key={c.id}
                label={i === 0 ? "A" : "B"}
                candidate={c}
                nameOf={nameOf}
              />
            ))}
          </div>

          <section aria-label="Differences" className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Differences</h2>
            {data.differences.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No comparable metrics were reported for these candidates.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full min-w-[480px] text-sm">
                  <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th className="p-2 font-medium">Metric</th>
                      <th className="p-2 font-medium">Unit</th>
                      <th className="p-2 text-right font-medium">A</th>
                      <th className="p-2 text-right font-medium">B</th>
                      <th className="p-2 text-right font-medium">
                        Delta (B minus A)
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.differences.map((d) => {
                      const pct = d.metric.startsWith("percent:");
                      return (
                        <tr key={d.metric} className="border-t">
                          <td className="p-2">{metricLabel(d.metric)}</td>
                          <td className="p-2 text-muted-foreground">
                            {d.unit ?? ""}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {cell(d.a, pct)}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {cell(d.b, pct)}
                          </td>
                          <td className="p-2 text-right tabular-nums">
                            {d.delta === null
                              ? "not computable"
                              : `${d.delta > 0 ? "+" : ""}${formatNumber(d.delta)}`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function CandidateColumn({
  label,
  candidate: c,
  nameOf,
}: {
  label: string;
  candidate: Candidate;
  nameOf: (id: string) => string;
}) {
  const protein = metricNumber(c, "protein_g_per_100g");
  const aas = metricNumber(c, "amino_acid_score");
  const cost = costOf(c);
  const limiting = c.metrics.limiting_amino_acid;
  return (
    <section
      aria-label={`Candidate ${label}`}
      className="flex flex-col gap-2 rounded-lg border p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-medium">
          Candidate {label}{" "}
          <span className="text-sm text-muted-foreground">rank {c.rank}</span>
        </h2>
        {c.pareto && <Badge>Pareto</Badge>}
        {c.from_cancelled_job && (
          <Badge variant="outline">From cancelled job</Badge>
        )}
        {c.scene.visual_basis === "illustrative" && (
          <Badge variant="secondary">Illustrative visual</Badge>
        )}
      </div>
      <Link
        href={`/formulations/${c.formulation_id}/candidates?job_id=${c.job_id}`}
        className="w-fit text-xs text-primary underline-offset-4 hover:underline"
      >
        Open in its formulation
      </Link>
      <ul className="text-sm">
        {c.lines.map((l) => (
          <li
            key={l.ingredient_id}
            className="flex justify-between gap-2 border-t py-0.5 first:border-t-0"
          >
            <span>{nameOf(l.ingredient_id)}</span>
            <span className="tabular-nums">{formatNumber(l.percent)}%</span>
          </li>
        ))}
      </ul>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-sm">
        <dt className="text-muted-foreground">Protein</dt>
        <dd className="tabular-nums">
          {protein === null ? NOT_REPORTED : `${formatNumber(protein)} g/100 g`}
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
      {c.predictions.length > 0 && (
        <div className="text-sm">
          <p className="mb-1 text-xs text-muted-foreground">
            Texture (literature-derived estimate)
          </p>
          <ul className="flex flex-col gap-1.5">
            {c.predictions.map((p) => (
              <PredictionLine key={p.target} p={p} />
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
