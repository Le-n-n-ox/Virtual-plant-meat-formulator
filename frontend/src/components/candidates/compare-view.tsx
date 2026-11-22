"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRef, useState } from "react";
import type { Camera } from "three";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";
import { CompareChart } from "@/components/candidates/compare-chart";
import { ModelBadge } from "@/components/models/model-badge";
import {
  CandidateViewport,
  syncView,
  type ViewportPair,
} from "@/components/candidates/candidate-viewport";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import { useIngredientNames } from "@/hooks/use-ingredient-names";
import { compareCandidates } from "@/lib/api/candidates";
import { errorMessage, formatNumber, humanizeKey } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Candidate, TexturePrediction } from "@/types";

/** Links each model behind the candidates' texture estimates to the registry. */
function ModelLinks({ items }: { items: Candidate[] }) {
  const models = new Map<string, TexturePrediction["model"]>();
  for (const c of items)
    for (const p of c.predictions) if (p.model) models.set(p.model.id, p.model);
  if (models.size === 0)
    return (
      <p className="text-xs text-muted-foreground">
        No model version was reported for these estimates.
      </p>
    );
  return (
    <>
      {[...models.values()].map((m) => (
        <ModelBadge key={m.id} model={m} />
      ))}
    </>
  );
}

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
    ["compare", ids[0], ids[1]],
    () => compareCandidates(ids[0], ids[1]),
    valid,
  );

  const [locked, setLocked] = useState(false);
  const [syncToken, setSyncToken] = useState(0);
  const controlsA = useRef<OrbitControlsImpl | null>(null);
  const controlsB = useRef<OrbitControlsImpl | null>(null);
  const cameraA = useRef<Camera | null>(null);
  const cameraB = useRef<Camera | null>(null);

  /** Read inside callbacks only; refs must not be read during render. */
  const pairA = (): ViewportPair => ({
    camera: cameraA.current,
    controls: controlsA.current,
  });
  const pairB = (): ViewportPair => ({
    camera: cameraB.current,
    controls: controlsB.current,
  });
  const handleControlsA = (controls: OrbitControlsImpl | null) => {
    controlsA.current = controls;
  };
  const handleControlsB = (controls: OrbitControlsImpl | null) => {
    controlsB.current = controls;
  };
  const handleCameraA = (camera: Camera | null) => {
    cameraA.current = camera;
  };
  const handleCameraB = (camera: Camera | null) => {
    cameraB.current = camera;
  };

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
          Side-by-side view of two optimizer candidates. The numbers stay
          visible beside the 3D views at all times.
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
              className="text-primary underline underline-offset-4"
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
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={locked}
                onChange={(e) => setLocked(e.target.checked)}
              />
              Lock cameras together
            </label>
            <Button
              size="sm"
              variant="outline"
              disabled={!locked}
              onClick={() => setSyncToken((t) => t + 1)}
            >
              Reset both views
            </Button>
            <span className="text-xs text-muted-foreground">
              {locked
                ? "Orbiting either view moves both."
                : "Turn on the lock to orbit both views together."}
            </span>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {data.items.map((c, i) => (
              <CandidateViewport
                key={c.id}
                label={i === 0 ? "A" : "B"}
                onControlsReady={i === 0 ? handleControlsA : handleControlsB}
                onCameraReady={i === 0 ? handleCameraA : handleCameraB}
                resetToken={syncToken}
                onUserView={() =>
                  i === 0
                    ? syncView(locked, pairA(), pairB())
                    : syncView(locked, pairB(), pairA())
                }
              />
            ))}
          </div>

          <CompareChart data={data} />

          <section
            aria-label="Models behind the texture estimates"
            className="flex flex-col gap-1.5"
          >
            <h2 className="text-sm font-medium">
              Models behind the texture estimates
            </h2>
            <ModelLinks items={data.items} />
          </section>

          <section aria-label="Differences" className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">
              Differences
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                shaded rows differ between the two candidates
              </span>
            </h2>
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
                      const differs = d.delta !== null && d.delta !== 0;
                      return (
                        <tr
                          key={d.metric}
                          className={cn("border-t", differs && "bg-muted/40")}
                        >
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
                          <td
                            className={cn(
                              "p-2 text-right tabular-nums",
                              differs
                                ? "font-medium text-foreground"
                                : "text-muted-foreground",
                            )}
                          >
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
