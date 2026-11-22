"use client";

import { PlayIcon, PlusIcon, Trash2Icon } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useShallow } from "zustand/react/shallow";
import { CandidateScatter } from "@/components/candidates/candidate-scatter";
import { JobProgress } from "@/components/jobs/job-progress";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { CatalogueSearch } from "@/components/workspace/catalogue-search";
import { ErrorBlock } from "@/components/workspace/error-block";
import {
  EMPTY_PROCESS,
  ProcessFields,
  parseProcess,
  type ProcessDraft,
} from "@/components/workspace/process-fields";
import { useApiQuery } from "@/hooks/use-api-query";
import { useIngredientNames } from "@/hooks/use-ingredient-names";
import { useSavedVersion } from "@/hooks/use-saved-version";
import { getJob, type OptimizationParams } from "@/lib/api/jobs";
import { listCandidates } from "@/lib/api/candidates";
import { listNutrients, type NutrientDefinition } from "@/lib/api/ingredients";
import { humanizeKey } from "@/lib/format";
import { runJob } from "@/lib/jobs/job-runner";
import {
  describeJobError,
  describeStartError,
  type StartErrorInfo,
} from "@/lib/jobs/start-error";
import { cn } from "@/lib/utils";
import { useFormulationStore } from "@/stores/formulationStore";
import { isTerminal, useJobStore } from "@/stores/jobStore";

type Direction = "maximize" | "minimize" | "target";

const OBJECTIVE_TARGETS = [
  {
    id: "protein_g_per_100g",
    label: "Protein (g per 100 g)",
    texture: false,
    defaultDirection: "maximize" as Direction,
  },
  {
    id: "cost_per_kg",
    label: "Cost per kg",
    texture: false,
    defaultDirection: "minimize" as Direction,
  },
  {
    id: "amino_acid_score",
    label: "Amino acid score (AAS)",
    texture: false,
    defaultDirection: "maximize" as Direction,
  },
  {
    id: "hardness",
    label: "Hardness (texture estimate)",
    texture: true,
    defaultDirection: "target" as Direction,
  },
  {
    id: "chewiness",
    label: "Chewiness (texture estimate)",
    texture: true,
    defaultDirection: "target" as Direction,
  },
];

const selectClass =
  "h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

interface ObjectiveRow {
  key: string;
  target: string;
  direction: Direction;
  value: string;
}
interface LimitRow {
  key: string;
  kind: "min" | "max";
  nutrient: string;
  value: string;
  unit: string;
}
interface BoundDraft {
  min: string;
  max: string;
  excluded: boolean;
}

const DEFAULT_BOUND: BoundDraft = { min: "0", max: "100", excluded: false };

/** Row keys only need to be unique inside the form, so a plain counter is enough. */
let rowKey = 0;
const newKey = () => `row-${(rowKey += 1)}`;

function num(text: string): number | undefined {
  if (text.trim() === "") return undefined;
  const n = Number(text);
  return Number.isFinite(n) ? n : undefined;
}

function unitOptions(n: NutrientDefinition | undefined): string[] {
  if (!n) return ["g", "mg", "ug"];
  if (n.kind === "amino_acid") return ["mg_per_g_protein", "mg", "g", "ug"];
  if (["kJ", "kcal"].includes(n.unit)) return [n.unit];
  return ["g", "mg", "ug"];
}

function defaultUnit(n: NutrientDefinition | undefined): string {
  if (!n) return "g";
  return n.kind === "amino_acid" ? "mg_per_g_protein" : n.unit;
}

export function OptimizeTab() {
  const { id, version, ready, loadState } = useSavedVersion();
  const savedLines = useFormulationStore((s) => s.savedLines);
  const { activeJobId, jobType, status, candidateIds } = useJobStore(
    useShallow((s) => ({
      activeJobId: s.activeJobId,
      jobType: s.jobType,
      status: s.status,
      candidateIds: s.candidateIds,
    })),
  );

  const [objectives, setObjectives] = useState<ObjectiveRow[]>([
    {
      key: newKey(),
      target: "protein_g_per_100g",
      direction: "maximize",
      value: "",
    },
  ]);
  const [bounds, setBounds] = useState<Record<string, BoundDraft>>({});
  const [extraIds, setExtraIds] = useState<string[]>([]);
  const [extraNames, setExtraNames] = useState<Record<string, string>>({});
  const [limits, setLimits] = useState<LimitRow[]>([]);
  const [costValue, setCostValue] = useState("");
  const [currency, setCurrency] = useState("KES");
  const [process, setProcess] = useState<ProcessDraft>(EMPTY_PROCESS);
  const [nCandidates, setNCandidates] = useState("5");
  const [seed, setSeed] = useState("");
  const [policy, setPolicy] = useState<"warn" | "drop">("warn");
  /**
   * The formulation's saved targets are the starting point (guide §5 page 6).
   * Applied once per saved version, so editing them here does not fight the
   * panel that owns them.
   */
  const targetSeed = useMemo(() => {
    if (!ready) return null;
    const t = useFormulationStore.getState().targets ?? {};

    const objectives: ObjectiveRow[] = [];
    if (t.protein_g_per_100g !== undefined) {
      objectives.push({
        key: newKey(),
        target: "protein_g_per_100g",
        direction: "target",
        value: String(t.protein_g_per_100g),
      });
    }
    if (objectives.length === 0) {
      objectives.push({
        key: newKey(),
        target: "protein_g_per_100g",
        direction: "maximize",
        value: "",
      });
    }

    return {
      version,
      objectives,
      limits: Object.entries(t)
        .filter(
          ([key]) => key !== "protein_g_per_100g" && key !== "cost_ceiling",
        )
        .map(([key, value]) => ({
          key: newKey(),
          kind: "min" as const,
          nutrient: key,
          value: String(value),
          unit: "mg_per_g_protein",
        })),
      cost: t.cost_ceiling === undefined ? null : String(t.cost_ceiling),
    };
  }, [ready, version]);

  const [appliedSeed, setAppliedSeed] = useState<number | null>(null);
  if (targetSeed && appliedSeed !== version) {
    setAppliedSeed(version);
    setObjectives(targetSeed.objectives);
    setLimits(targetSeed.limits);
    if (targetSeed.cost !== null) setCostValue(targetSeed.cost);
  }

  const [formError, setFormError] = useState<string | null>(null);
  const [startError, setStartError] = useState<StartErrorInfo | null>(null);

  const nutrients = useApiQuery(["nutrients"], listNutrients, ready);
  const nutrientList: NutrientDefinition[] = Array.isArray(nutrients.data)
    ? nutrients.data
    : (nutrients.data?.items ?? []);

  const formulationIds = savedLines.map((l) => l.ingredient_id);
  const rowIds = [...formulationIds, ...extraIds];
  const nameOf = useIngredientNames(rowIds);

  const isOptimization = jobType === "optimization";
  const running = activeJobId !== null && isOptimization && !isTerminal(status);
  const finished = isOptimization && activeJobId !== null && isTerminal(status);
  const failedJobId =
    isOptimization && status === "failed" ? activeJobId : null;
  const failure = useApiQuery(
    ["jobs", failedJobId],
    async () => describeJobError((await getJob(failedJobId ?? "")).error),
    failedJobId !== null,
  );
  const scatter = useApiQuery(
    ["candidates", { formulationId: id, jobId: activeJobId }],
    () =>
      listCandidates(id, {
        job_id: activeJobId ?? undefined,
        page_size: 100,
      }),
    finished,
  );
  const hasTexture = objectives.some(
    (o) => OBJECTIVE_TARGETS.find((t) => t.id === o.target)?.texture,
  );

  function boundOf(ingredientId: string): BoundDraft {
    return bounds[ingredientId] ?? DEFAULT_BOUND;
  }
  function patchBound(ingredientId: string, patch: Partial<BoundDraft>) {
    setBounds((b) => ({
      ...b,
      [ingredientId]: { ...(b[ingredientId] ?? DEFAULT_BOUND), ...patch },
    }));
  }

  function build(): { params?: OptimizationParams; error?: string } {
    if (objectives.length === 0)
      return { error: "Add at least one objective." };
    const objs: OptimizationParams["objectives"] = [];
    for (const o of objectives) {
      const meta = OBJECTIVE_TARGETS.find((t) => t.id === o.target);
      if (o.direction === "target") {
        const v = num(o.value);
        if (v === undefined)
          return {
            error: `Enter the target value for ${meta?.label ?? o.target}.`,
          };
        objs.push({
          target: o.target,
          direction: "target",
          value: v,
          ...(o.target === "hardness" ? { unit: "N" } : {}),
        });
      } else {
        objs.push({ target: o.target, direction: o.direction });
      }
    }

    const constraints: NonNullable<OptimizationParams["constraints"]> = {};
    const ingredientBounds: NonNullable<
      NonNullable<OptimizationParams["constraints"]>["ingredient_bounds"]
    > = [];
    const excluded: string[] = [];
    for (const ingredientId of rowIds) {
      const b = boundOf(ingredientId);
      if (b.excluded) {
        excluded.push(ingredientId);
        continue;
      }
      const lo = num(b.min);
      const hi = num(b.max);
      if (lo === undefined || hi === undefined)
        return { error: `Bounds for ${nameOf(ingredientId)} must be numbers.` };
      if (lo < 0 || hi > 100 || lo > hi)
        return {
          error: `Bounds for ${nameOf(ingredientId)} must satisfy 0 <= min <= max <= 100.`,
        };
      if (lo > 0 || hi < 100 || extraIds.includes(ingredientId))
        ingredientBounds.push({
          ingredient_id: ingredientId,
          min_percent: lo,
          max_percent: hi,
        });
    }
    if (ingredientBounds.length)
      constraints.ingredient_bounds = ingredientBounds;
    if (excluded.length) constraints.excluded_ingredient_ids = excluded;

    const mins: NonNullable<
      NonNullable<OptimizationParams["constraints"]>["nutrient_minimums"]
    > = [];
    const maxs: NonNullable<
      NonNullable<OptimizationParams["constraints"]>["nutrient_maximums"]
    > = [];
    for (const l of limits) {
      const v = num(l.value);
      if (!l.nutrient || v === undefined)
        return { error: "Each nutrient limit needs a nutrient and a number." };
      if (l.kind === "min")
        mins.push({ key: l.nutrient, min: v, unit: l.unit });
      else maxs.push({ key: l.nutrient, max: v, unit: l.unit });
    }
    if (mins.length) constraints.nutrient_minimums = mins;
    if (maxs.length) constraints.nutrient_maximums = maxs;

    if (costValue.trim() !== "") {
      const v = num(costValue);
      if (v === undefined || v < 0)
        return { error: "Cost ceiling must be a number of 0 or more." };
      if (!currency.trim()) return { error: "Enter the cost currency." };
      constraints.cost_ceiling = {
        value: v,
        currency: currency.trim().toUpperCase(),
        per: "kg",
      };
    }

    const parsed = parseProcess(process, hasTexture);
    if (parsed.error) return { error: parsed.error };

    const n = Number(nCandidates);
    if (!Number.isInteger(n) || n < 1 || n > 20)
      return { error: "Number of candidates must be a whole number 1 to 20." };
    let seedValue: number | undefined;
    if (seed.trim() !== "") {
      seedValue = Number(seed);
      if (!Number.isInteger(seedValue) || seedValue < 0)
        return { error: "Seed must be a whole number of 0 or more." };
    }

    const params: OptimizationParams = {
      objectives: objs,
      n_candidates: n,
      out_of_domain: policy,
    };
    if (Object.keys(constraints).length) params.constraints = constraints;
    if (parsed.process && Object.keys(parsed.process).length)
      params.process = parsed.process;
    if (seedValue !== undefined) params.seed = seedValue;
    return { params };
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setStartError(null);
    const built = build();
    if (!built.params) {
      setFormError(built.error ?? "Check the form.");
      return;
    }
    setFormError(null);
    try {
      await runJob(id, version, { type: "optimization", params: built.params });
    } catch (error) {
      setStartError(describeStartError(error));
    }
  }

  if (loadState === "loading" || loadState === "idle")
    return <Skeleton className="h-48 w-full" />;
  if (!ready) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Save the formulation first: optimization runs on a saved version.
      </p>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="flex flex-col gap-5"
      aria-label="Optimize"
    >
      <div>
        <h1 className="text-lg font-semibold">
          Optimize{" "}
          <span className="text-sm font-normal text-muted-foreground">
            v{version}
          </span>
        </h1>
        <p className="text-xs text-muted-foreground">
          Searches for ingredient mixes that meet your objectives and limits.
          Texture objectives use literature-derived estimates and need process
          conditions.
        </p>
      </div>

      <fieldset disabled={running} className="flex flex-col gap-5">
        <Section title="Objectives">
          {objectives.map((o, i) => {
            const meta = OBJECTIVE_TARGETS.find((t) => t.id === o.target);
            return (
              <div key={o.key} className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={`Objective ${i + 1} target`}
                  className={cn(selectClass, "min-w-0 flex-1")}
                  value={o.target}
                  onChange={(e) => {
                    const t = OBJECTIVE_TARGETS.find(
                      (x) => x.id === e.target.value,
                    );
                    setObjectives((rows) =>
                      rows.map((r) =>
                        r.key === o.key
                          ? {
                              ...r,
                              target: e.target.value,
                              direction: t?.defaultDirection ?? "maximize",
                              value: "",
                            }
                          : r,
                      ),
                    );
                  }}
                >
                  {OBJECTIVE_TARGETS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
                <select
                  aria-label={`Objective ${i + 1} direction`}
                  className={selectClass}
                  value={o.direction}
                  onChange={(e) =>
                    setObjectives((rows) =>
                      rows.map((r) =>
                        r.key === o.key
                          ? { ...r, direction: e.target.value as Direction }
                          : r,
                      ),
                    )
                  }
                >
                  <option value="maximize">Maximize</option>
                  <option value="minimize">Minimize</option>
                  {meta?.texture && (
                    <option value="target">Target value</option>
                  )}
                </select>
                {o.direction === "target" && (
                  <Input
                    type="number"
                    step="any"
                    aria-label={`Objective ${i + 1} target value`}
                    placeholder={o.target === "hardness" ? "N" : "value"}
                    value={o.value}
                    onChange={(e) =>
                      setObjectives((rows) =>
                        rows.map((r) =>
                          r.key === o.key ? { ...r, value: e.target.value } : r,
                        ),
                      )
                    }
                    className="w-24"
                  />
                )}
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove objective ${i + 1}`}
                  onClick={() =>
                    setObjectives((rows) => rows.filter((r) => r.key !== o.key))
                  }
                >
                  <Trash2Icon />
                </Button>
              </div>
            );
          })}
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setObjectives((rows) => [
                  ...rows,
                  {
                    key: newKey(),
                    target: "protein_g_per_100g",
                    direction: "maximize",
                    value: "",
                  },
                ])
              }
            >
              <PlusIcon aria-hidden /> Add objective
            </Button>
          </div>
        </Section>

        <Section title="Ingredient limits (% of mass)">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Ingredient</th>
                <th className="w-20 py-1 font-medium">Min %</th>
                <th className="w-20 py-1 font-medium">Max %</th>
                <th className="w-16 py-1 font-medium">Exclude</th>
                <th className="w-8 py-1">
                  <span className="sr-only">Remove</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rowIds.map((ingredientId) => {
                const b = boundOf(ingredientId);
                const name = extraNames[ingredientId] ?? nameOf(ingredientId);
                const extra = extraIds.includes(ingredientId);
                return (
                  <tr key={ingredientId} className="border-t">
                    <td className="py-1 pr-2">
                      {name}
                      {extra && (
                        <span className="ml-1 text-xs text-muted-foreground">
                          (added)
                        </span>
                      )}
                    </td>
                    <td className="py-1 pr-1">
                      <Input
                        type="number"
                        step="any"
                        min={0}
                        max={100}
                        aria-label={`Minimum percent of ${name}`}
                        value={b.min}
                        disabled={b.excluded}
                        onChange={(e) =>
                          patchBound(ingredientId, { min: e.target.value })
                        }
                        className="h-7 tabular-nums"
                      />
                    </td>
                    <td className="py-1 pr-1">
                      <Input
                        type="number"
                        step="any"
                        min={0}
                        max={100}
                        aria-label={`Maximum percent of ${name}`}
                        value={b.max}
                        disabled={b.excluded}
                        onChange={(e) =>
                          patchBound(ingredientId, { max: e.target.value })
                        }
                        className="h-7 tabular-nums"
                      />
                    </td>
                    <td className="py-1">
                      <input
                        type="checkbox"
                        aria-label={`Exclude ${name}`}
                        checked={b.excluded}
                        onChange={(e) =>
                          patchBound(ingredientId, {
                            excluded: e.target.checked,
                          })
                        }
                      />
                    </td>
                    <td className="py-1 text-right">
                      {extra && (
                        <Button
                          type="button"
                          size="icon-sm"
                          variant="ghost"
                          aria-label={`Remove ${name}`}
                          onClick={() =>
                            setExtraIds((ids) =>
                              ids.filter((x) => x !== ingredientId),
                            )
                          }
                        >
                          <Trash2Icon />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-xs text-muted-foreground">
            Add ingredients from the catalogue to let the search use them too.
          </p>
          <CatalogueSearch
            label="Search ingredients to add"
            takenIds={rowIds}
            onPick={(item) => {
              setExtraIds((ids) => [...ids, item.id]);
              setExtraNames((names) => ({
                ...names,
                [item.id]: item.common_name,
              }));
            }}
          />
        </Section>

        <Section title="Nutrient limits">
          {limits.map((l, i) => {
            const def = nutrientList.find((n) => n.key === l.nutrient);
            return (
              <div key={l.key} className="flex flex-wrap items-center gap-2">
                <select
                  aria-label={`Nutrient limit ${i + 1} type`}
                  className={selectClass}
                  value={l.kind}
                  onChange={(e) =>
                    setLimits((rows) =>
                      rows.map((r) =>
                        r.key === l.key
                          ? { ...r, kind: e.target.value as "min" | "max" }
                          : r,
                      ),
                    )
                  }
                >
                  <option value="min">At least</option>
                  <option value="max">At most</option>
                </select>
                <select
                  aria-label={`Nutrient limit ${i + 1} nutrient`}
                  className={cn(selectClass, "min-w-0 flex-1")}
                  value={l.nutrient}
                  onChange={(e) => {
                    const d = nutrientList.find(
                      (n) => n.key === e.target.value,
                    );
                    setLimits((rows) =>
                      rows.map((r) =>
                        r.key === l.key
                          ? {
                              ...r,
                              nutrient: e.target.value,
                              unit: defaultUnit(d),
                            }
                          : r,
                      ),
                    );
                  }}
                >
                  <option value="">Choose nutrient</option>
                  {nutrientList.map((n) => (
                    <option key={n.key} value={n.key}>
                      {n.name} ({humanizeKey(n.kind)})
                    </option>
                  ))}
                </select>
                <Input
                  type="number"
                  step="any"
                  min={0}
                  aria-label={`Nutrient limit ${i + 1} value`}
                  value={l.value}
                  onChange={(e) =>
                    setLimits((rows) =>
                      rows.map((r) =>
                        r.key === l.key ? { ...r, value: e.target.value } : r,
                      ),
                    )
                  }
                  className="w-24"
                />
                <select
                  aria-label={`Nutrient limit ${i + 1} unit`}
                  className={selectClass}
                  value={l.unit}
                  onChange={(e) =>
                    setLimits((rows) =>
                      rows.map((r) =>
                        r.key === l.key ? { ...r, unit: e.target.value } : r,
                      ),
                    )
                  }
                >
                  {unitOptions(def).map((u) => (
                    <option key={u} value={u}>
                      {u === "mg_per_g_protein" ? "mg per g protein" : u}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="icon-sm"
                  variant="ghost"
                  aria-label={`Remove nutrient limit ${i + 1}`}
                  onClick={() =>
                    setLimits((rows) => rows.filter((r) => r.key !== l.key))
                  }
                >
                  <Trash2Icon />
                </Button>
              </div>
            );
          })}
          {nutrients.error && (
            <p role="alert" className="text-xs text-destructive">
              Could not load the nutrient list.
            </p>
          )}
          <div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setLimits((rows) => [
                  ...rows,
                  {
                    key: newKey(),
                    kind: "min",
                    nutrient: "",
                    value: "",
                    unit: "g",
                  },
                ])
              }
            >
              <PlusIcon aria-hidden /> Add nutrient limit
            </Button>
          </div>
        </Section>

        <Section title="Cost ceiling">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="opt-cost">Maximum cost per kg</Label>
              <Input
                id="opt-cost"
                type="number"
                min={0}
                step="any"
                value={costValue}
                onChange={(e) => setCostValue(e.target.value)}
                className="w-32"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="opt-currency">Currency</Label>
              <Input
                id="opt-currency"
                value={currency}
                maxLength={3}
                onChange={(e) => setCurrency(e.target.value)}
                className="w-20"
              />
            </div>
          </div>
        </Section>

        <Section
          title={
            hasTexture
              ? "Process conditions (required for texture objectives)"
              : "Process conditions (needed only for texture objectives)"
          }
        >
          <ProcessFields
            idPrefix="opt"
            value={process}
            onChange={setProcess}
            moistureRequired={hasTexture}
          />
        </Section>

        <Section title="Search settings">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="opt-n">Candidates (1 to 20)</Label>
              <Input
                id="opt-n"
                type="number"
                min={1}
                max={20}
                step={1}
                value={nCandidates}
                onChange={(e) => setNCandidates(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="opt-seed">Seed (optional)</Label>
              <Input
                id="opt-seed"
                type="number"
                min={0}
                step={1}
                value={seed}
                onChange={(e) => setSeed(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="opt-ood">Out-of-domain texture</Label>
              <select
                id="opt-ood"
                className={selectClass}
                value={policy}
                onChange={(e) => setPolicy(e.target.value as "warn" | "drop")}
              >
                <option value="warn">Warn and keep</option>
                <option value="drop">Drop candidates</option>
              </select>
            </div>
          </div>
        </Section>
      </fieldset>

      {formError && (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}
      <div>
        <Button type="submit" disabled={running}>
          <PlayIcon aria-hidden /> Run optimization
        </Button>
      </div>

      <JobProgress types={["optimization"]} cancellable />
      {startError && <ErrorBlock error={startError} />}
      {failedJobId && failure.data && <ErrorBlock error={failure.data} />}
      {finished && status === "completed" && (
        <p className="rounded-lg border border-success/60 bg-success/5 p-3 text-sm">
          Optimization finished with {candidateIds.length} candidate
          {candidateIds.length === 1 ? "" : "s"}.{" "}
          <Link
            href={`/formulations/${id}/candidates?job_id=${activeJobId}`}
            className="font-medium text-primary underline underline-offset-4"
          >
            View candidates
          </Link>
        </p>
      )}
      {finished && status === "cancelled" && (
        <p className="rounded-lg border p-3 text-sm">
          Optimization cancelled. Candidates stored before cancelling stay
          readable.{" "}
          <Link
            href={`/formulations/${id}/candidates?job_id=${activeJobId}`}
            className="font-medium text-primary underline underline-offset-4"
          >
            View candidates
          </Link>
        </p>
      )}

      {scatter.data && scatter.data.items.length > 0 && (
        <CandidateScatter candidates={scatter.data.items} />
      )}
    </form>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border p-3">
      <h2 className="text-sm font-medium">{title}</h2>
      {children}
    </section>
  );
}
