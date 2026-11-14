"use client";

import {
  CheckCircle2Icon,
  PlayIcon,
  PlusIcon,
  SquareIcon,
  Trash2Icon,
  TriangleAlertIcon,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { DEMO_INGREDIENTS } from "@/mocks/fixtures/ingredients";
import { SCENARIOS, type ScenarioId, playScenario } from "@/mocks/scenarios";
import { useFormulationStore } from "@/stores/formulationStore";
import { isTerminal, useJobStore } from "@/stores/jobStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { cropVar } from "@/scene/theme/sceneTheme";

/**
 * Preliminary editor so the scene can be exercised end-to-end. The full
 * editor (picker, targets, save/versions) is page 6 in the frontend guide.
 */
export function FormulationEditor() {
  const { id } = useParams<{ id: string }>();
  const { name, version, draft, catalog, validated, revisionMatches } =
    useFormulationStore(
      useShallow((s) => ({
        name: s.name,
        version: s.version,
        draft: s.draft,
        catalog: s.catalog,
        validated: s.validated,
        revisionMatches: s.validated?.lines === s.draft,
      })),
    );
  const { addIngredient, removeIngredient, setPercent } = useFormulationStore(
    useShallow((s) => ({
      addIngredient: s.addIngredient,
      removeIngredient: s.removeIngredient,
      setPercent: s.setPercent,
    })),
  );
  const [selectedId, selectIngredient] = useSelectionStore(
    useShallow((s) => [s.selectedIngredientId, s.selectIngredient]),
  );

  if (id !== "demo") {
    return (
      <p className="text-sm text-muted-foreground">
        Loading saved formulations needs the formulations API. Open{" "}
        <Link className="text-primary underline" href="/formulations/demo">
          the demo workspace
        </Link>{" "}
        to try the editor and 3D scene.
      </p>
    );
  }

  const available = DEMO_INGREDIENTS.filter(
    (i) => !draft.some((l) => l.ingredient_id === i.id),
  );
  const result = validated?.result;
  const total = draft.reduce(
    (s, l) => s + (Number.isFinite(l.percent) ? l.percent : 0),
    0,
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-semibold">{name}</h1>
        <Badge variant="secondary">v{version}</Badge>
        <Badge variant="outline" className="border-warning/60">
          Demo data · no nutrient values
        </Badge>
      </div>

      <section aria-label="Ingredients" className="flex flex-col gap-2">
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
              const issue = result?.issues.find(
                (x) => x.ingredient_id === line.ingredient_id,
              );
              const selected = selectedId === line.ingredient_id;
              return (
                <tr
                  key={line.ingredient_id}
                  className={cn("border-t", selected && "bg-accent/50")}
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
                  </td>
                  <td className="py-1.5 text-muted-foreground">{ing?.form}</td>
                  <td className="py-1.5">
                    <Input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      step={0.5}
                      value={Number.isFinite(line.percent) ? line.percent : ""}
                      aria-label={`Percentage of ${ing?.common_name ?? line.ingredient_id}`}
                      aria-invalid={Boolean(issue)}
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

        {available.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {available.map((ing) => (
              <Button
                key={ing.id}
                size="xs"
                variant="outline"
                onClick={() => addIngredient(ing, 0)}
              >
                <PlusIcon aria-hidden /> {ing.common_name}
              </Button>
            ))}
          </div>
        )}
      </section>

      <TotalsBar
        total={total}
        valid={result?.valid ?? false}
        pending={!revisionMatches}
        messages={result?.issues.map((i) => i.message) ?? []}
      />

      <DemoJobs />
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

/** Dev-only: replays scripted job events so the scene can be tested without a backend. */
function DemoJobs() {
  const [scenario, setScenario] = useState<ScenarioId>("optimization");
  const stop = useRef<(() => void) | null>(null);
  const { status, candidateIds, activeJobId } = useJobStore(
    useShallow((s) => ({
      status: s.status,
      candidateIds: s.candidateIds,
      activeJobId: s.activeJobId,
    })),
  );
  const [selectedCandidate, selectCandidate] = useSelectionStore(
    useShallow((s) => [s.selectedCandidateId, s.selectCandidate]),
  );
  const running = activeJobId !== null && !isTerminal(status);

  return (
    <section
      aria-label="Mock job events"
      className="flex flex-col gap-2 rounded-lg border border-dashed p-3"
    >
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-medium">Run a mock job</h2>
        <Badge variant="outline">Mock events</Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        Replays a scripted event stream into the job store, exactly as the SSE
        client will. No calculations are run.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <select
          className="h-8 rounded-lg border bg-background px-2 text-sm"
          value={scenario}
          onChange={(e) => setScenario(e.target.value as ScenarioId)}
          aria-label="Scenario"
          disabled={running}
        >
          {SCENARIOS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={running}
          onClick={() => {
            stop.current?.();
            selectCandidate(null);
            stop.current = playScenario(scenario);
          }}
        >
          <PlayIcon aria-hidden /> Run
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={!running}
          onClick={() => {
            stop.current?.();
            const s = useJobStore.getState();
            if (s.activeJobId) {
              s.applyEvent({
                job_id: s.activeJobId,
                event: "job.cancelled",
                status: "cancelled",
                stage: s.currentStage ?? "",
                stage_label: s.currentStage
                  ? (s.stageLabels[s.currentStage] ?? "")
                  : "",
                progress_percent: null,
                candidate_id: null,
                message: "Cancelled by user.",
                timestamp: new Date().toISOString(),
                seq: (s.lastSeq ?? 0) + 1,
              });
            }
          }}
        >
          <SquareIcon aria-hidden /> Cancel
        </Button>
      </div>
      {candidateIds.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-xs text-muted-foreground">Candidates:</span>
          {candidateIds.map((c) => (
            <Button
              key={c}
              size="xs"
              variant={selectedCandidate === c ? "secondary" : "outline"}
              aria-pressed={selectedCandidate === c}
              onClick={() => selectCandidate(c)}
            >
              Preview {c}
            </Button>
          ))}
        </div>
      )}
    </section>
  );
}
