"use client";

import {
  CheckCircle2Icon,
  FlaskConicalIcon,
  PlayIcon,
  SaveIcon,
  SquareIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { IngredientPicker } from "@/components/formulation/ingredient-picker";
import { TextureDialog } from "@/components/formulation/texture-dialog";
import { ExplainPanel } from "@/components/assistant/explain-panel";
import { NutritionResults } from "@/components/results/nutrition-results";
import { TextureResults } from "@/components/results/texture-results";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/client";
import { saveFormulation } from "@/lib/api/formulations";
import { cancelJob, type ProcessConditions } from "@/lib/api/jobs";
import { describeRunError, runJob } from "@/lib/jobs/job-runner";
import { errorMessage } from "@/lib/format";
import { cn } from "@/lib/utils";
import { cropVar } from "@/scene/theme/sceneTheme";
import { useFormulationStore } from "@/stores/formulationStore";
import { isTerminal, useJobStore } from "@/stores/jobStore";
import { useResultStore } from "@/stores/resultStore";
import { useSelectionStore } from "@/stores/selectionStore";
import type { FormulationLine } from "@/types";

function sameLines(a: FormulationLine[], b: FormulationLine[]): boolean {
  return (
    a.length === b.length &&
    a.every(
      (l, i) =>
        l.ingredient_id === b[i].ingredient_id && l.percent === b[i].percent,
    )
  );
}

export function FormulationEditor() {
  const { id } = useParams<{ id: string }>();
  const {
    name,
    version,
    draft,
    savedLines,
    catalog,
    validated,
    loadState,
    loadError,
  } = useFormulationStore(
    useShallow((s) => ({
      name: s.name,
      version: s.version,
      draft: s.draft,
      savedLines: s.savedLines,
      catalog: s.catalog,
      validated: s.validated,
      loadState: s.loadState,
      loadError: s.loadError,
    })),
  );
  const { removeIngredient, setPercent } = useFormulationStore(
    useShallow((s) => ({
      removeIngredient: s.removeIngredient,
      setPercent: s.setPercent,
    })),
  );
  const [selectedId, selectIngredient] = useSelectionStore(
    useShallow((s) => [s.selectedIngredientId, s.selectIngredient]),
  );

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [textureOpen, setTextureOpen] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  if (loadState === "loading" || loadState === "idle") {
    return (
      <Skeleton className="h-64 w-full" aria-label="Loading formulation" />
    );
  }
  if (loadState === "error") {
    return (
      <p role="alert" className="text-sm text-destructive">
        {loadError ?? "Could not load this formulation."}
      </p>
    );
  }

  const result = validated?.result;
  const revisionMatches = validated?.lines === draft;
  const valid = Boolean(revisionMatches && result?.valid);
  const dirty = !sameLines(draft, savedLines);
  const total = draft.reduce(
    (s, l) => s + (Number.isFinite(l.percent) ? l.percent : 0),
    0,
  );
  const canRun = version > 0 && !dirty;

  async function save() {
    setSaving(true);
    setSaveError(null);
    setConflict(false);
    try {
      const saved = await saveFormulation(id, {
        base_version: version,
        lines: draft,
      });
      useFormulationStore.getState().markSaved(saved);
      useResultStore.getState().clear();
    } catch (error) {
      if (error instanceof ApiError && error.code === "version_conflict") {
        setConflict(true);
      } else {
        setSaveError(errorMessage(error));
      }
    } finally {
      setSaving(false);
    }
  }

  async function start(body: Parameters<typeof runJob>[2]): Promise<void> {
    setStartError(null);
    selectIngredient(null);
    await runJob(id, version, body);
  }

  async function startNutrition() {
    try {
      await start({ type: "nutrition" });
    } catch (error) {
      setStartError(
        error instanceof ApiError
          ? describeRunError(error.code, error.message)
          : errorMessage(error),
      );
    }
  }

  async function startTexture(process: ProcessConditions, targets: string[]) {
    await start({ type: "texture_prediction", params: { process, targets } });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">{name}</h1>
        <Badge variant="secondary">
          {version === 0 ? "Not saved yet" : `v${version}`}
        </Badge>
        {dirty ? (
          <Badge variant="outline" className="border-warning/60">
            Unsaved changes
          </Badge>
        ) : version > 0 ? (
          <Badge variant="outline" className="gap-1">
            <CheckCircle2Icon className="text-success" aria-hidden /> Saved
          </Badge>
        ) : null}
      </div>

      <section aria-label="Ingredients" className="flex flex-col gap-3">
        {draft.length === 0 ? (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            No ingredients yet. Search the catalogue below to add some.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-medium">Ingredient</th>
                <th className="py-1 font-medium">Form</th>
                <th className="w-28 py-1 font-medium">% of mass</th>
                <th className="w-10 py-1">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {draft.map((line, i) => {
                const ing = catalog[line.ingredient_id];
                const issues =
                  (revisionMatches &&
                    result?.issues.filter(
                      (x) => x.ingredient_id === line.ingredient_id,
                    )) ||
                  [];
                const selected = selectedId === line.ingredient_id;
                return (
                  <tr
                    key={line.ingredient_id}
                    className={cn(
                      "border-t align-top",
                      selected && "bg-accent/50",
                    )}
                    onClick={() => selectIngredient(line.ingredient_id)}
                  >
                    <td className="py-1.5">
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="size-2.5 shrink-0 rounded-full"
                          style={{ background: cropVar(i) }}
                        />
                        {ing?.common_name ?? line.ingredient_id}
                      </span>
                      {issues.map((x) => (
                        <p
                          key={x.code + x.message}
                          className="mt-0.5 pl-4.5 text-xs text-destructive"
                        >
                          {x.message}
                        </p>
                      ))}
                    </td>
                    <td className="py-1.5 text-muted-foreground">
                      {ing?.form}
                    </td>
                    <td className="py-1.5">
                      <Input
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={100}
                        step={0.5}
                        value={
                          Number.isFinite(line.percent) ? line.percent : ""
                        }
                        aria-label={`Percentage of ${ing?.common_name ?? line.ingredient_id}`}
                        aria-invalid={issues.length > 0}
                        onChange={(e) =>
                          setPercent(
                            line.ingredient_id,
                            e.target.value === ""
                              ? Number.NaN
                              : Number(e.target.value),
                          )
                        }
                        className="h-7 tabular-nums"
                      />
                    </td>
                    <td className="py-1.5 text-right">
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remove ${ing?.common_name ?? line.ingredient_id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          removeIngredient(line.ingredient_id);
                        }}
                      >
                        <Trash2Icon />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        <IngredientPicker takenIds={draft.map((l) => l.ingredient_id)} />
      </section>

      <TotalsBar
        total={total}
        valid={valid}
        pending={!revisionMatches}
        messages={
          revisionMatches
            ? (result?.issues
                .filter((i) => !i.ingredient_id)
                .map((i) => i.message) ?? [])
            : []
        }
      />

      <section aria-label="Save" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => void save()}
            disabled={!valid || !dirty || saving}
          >
            <SaveIcon aria-hidden /> {saving ? "Saving…" : "Save"}
          </Button>
          {!valid && dirty && (
            <span className="text-xs text-muted-foreground">
              Fix the issues above to save.
            </span>
          )}
        </div>
        {saveError && (
          <p role="alert" className="text-sm text-destructive">
            {saveError}
          </p>
        )}
        {conflict && (
          <div
            role="alert"
            className="flex flex-wrap items-center gap-2 rounded-lg border border-warning/70 bg-warning/10 p-3 text-sm"
          >
            <TriangleAlertIcon className="size-4 text-warning" aria-hidden />
            <span>
              This formulation was changed elsewhere since you opened it. Reload
              to see the latest version (your unsaved edits will be replaced).
            </span>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setConflict(false);
                useFormulationStore.getState().requestReload();
              }}
            >
              Reload latest
            </Button>
          </div>
        )}
      </section>

      <JobSection
        canRun={canRun}
        dirty={dirty}
        startError={startError}
        onNutrition={() => void startNutrition()}
        onTexture={() => setTextureOpen(true)}
      />
      <TextureDialog
        open={textureOpen}
        onOpenChange={setTextureOpen}
        onSubmit={startTexture}
      />
      <Results />
    </div>
  );
}

function TotalsBar({
  total,
  valid,
  pending,
  messages,
}: {
  total: number;
  valid: boolean;
  pending: boolean;
  messages: string[];
}) {
  const rounded = Math.round(total * 100) / 100;
  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-sm",
        pending
          ? "border-border"
          : valid
            ? "border-success/60 bg-success/5"
            : "border-warning/70 bg-warning/10",
      )}
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 font-medium">
          {pending ? null : valid ? (
            <CheckCircle2Icon className="size-4 text-success" aria-hidden />
          ) : (
            <TriangleAlertIcon className="size-4 text-warning" aria-hidden />
          )}
          Total {rounded}%
        </span>
        <span className="text-xs text-muted-foreground">
          {pending
            ? "Validating…"
            : valid
              ? "Valid — scene updated"
              : "Needs attention"}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted"
        aria-hidden
      >
        <div
          className={cn(
            "h-full rounded-full",
            valid ? "bg-success" : "bg-warning",
          )}
          style={{ width: `${Math.min(100, Math.max(0, rounded))}%` }}
        />
      </div>
      {!pending && messages.length > 0 && (
        <ul className="mt-2 list-disc pl-4 text-xs text-muted-foreground">
          {messages.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

function JobSection({
  canRun,
  dirty,
  startError,
  onNutrition,
  onTexture,
}: {
  canRun: boolean;
  dirty: boolean;
  startError: string | null;
  onNutrition: () => void;
  onTexture: () => void;
}) {
  const { status, activeJobId, message } = useJobStore(
    useShallow((s) => ({
      status: s.status,
      activeJobId: s.activeJobId,
      message: s.message,
    })),
  );
  const [cancelError, setCancelError] = useState<string | null>(null);
  const running = activeJobId !== null && !isTerminal(status);

  async function cancel() {
    if (!activeJobId) return;
    setCancelError(null);
    try {
      await cancelJob(activeJobId);
    } catch (error) {
      setCancelError(errorMessage(error));
    }
  }

  return (
    <section
      aria-label="Calculations"
      className="flex flex-col gap-2 rounded-lg border p-3"
    >
      <h2 className="text-sm font-medium">Calculations</h2>
      <p className="text-xs text-muted-foreground">
        Jobs run on the saved version
        {dirty ? " — save your changes first." : "."}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" disabled={!canRun || running} onClick={onNutrition}>
          <PlayIcon aria-hidden /> Run nutrition
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!canRun || running}
          onClick={onTexture}
        >
          <FlaskConicalIcon aria-hidden /> Predict texture
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!running}
          onClick={() => void cancel()}
        >
          <SquareIcon aria-hidden /> Cancel
        </Button>
      </div>
      {running && message && (
        <p className="text-xs text-muted-foreground">{message}</p>
      )}
      {(startError || cancelError) && (
        <p role="alert" className="text-sm text-destructive">
          {startError ?? cancelError}
        </p>
      )}
    </section>
  );
}

function Results() {
  const {
    nutrition,
    texture,
    nutritionJobId,
    textureJobId,
    loading,
    error,
    version,
  } = useResultStore(
    useShallow((s) => ({
      nutrition: s.nutrition,
      texture: s.texture,
      nutritionJobId: s.nutritionJobId,
      textureJobId: s.textureJobId,
      loading: s.loading,
      error: s.error,
      version: s.version,
    })),
  );
  const current = useFormulationStore((s) => s.version);
  if (loading) return <Skeleton className="h-24 w-full" />;
  if (error) {
    return (
      <p role="alert" className="text-sm text-destructive">
        {describeRunError(error.code, error.message)}
      </p>
    );
  }
  if (version !== null && version !== current) return null;
  return (
    <>
      {nutrition && <NutritionResults result={nutrition} />}
      {nutrition && nutritionJobId && (
        <ExplainPanel
          target={{ kind: "job", id: nutritionJobId }}
          label="Explain nutrition"
        />
      )}
      {texture && <TextureResults result={texture} />}
      {texture && textureJobId && (
        <ExplainPanel
          target={{ kind: "job", id: textureJobId }}
          label="Explain texture prediction"
        />
      )}
    </>
  );
}
