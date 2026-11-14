"use client";

import { BoxIcon, InfoIcon, RotateCcwIcon, SquareIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { useShallow } from "zustand/react/shallow";
import { JobProgress } from "@/components/jobs/job-status";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useFormulationStore } from "@/stores/formulationStore";
import { useJobStore } from "@/stores/jobStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useSceneStore } from "@/stores/sceneStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { SceneErrorBoundary } from "./SceneErrorBoundary";
import { SceneLabels } from "./SceneLabels";
import { Workspace2D } from "./fallback/Workspace2D";
import { useResolvedView } from "./hooks/useSceneEnvironment";
import { PROCESS_STATIONS, STAGE_STATUS_TEXT } from "./stations";
import { cropVar } from "./theme/sceneTheme";

const SceneCanvas = dynamic(() => import("./SceneCanvas"), {
  ssr: false,
  loading: () => <Skeleton className="size-full rounded-none" />,
});

/**
 * Scene panel used by the formulation workspace: 3D canvas (or 2D fallback),
 * toolbar, live status overlay, and a keyboard-accessible mirror of every
 * selectable object.
 */
export function WorkspaceScene({ className }: { className?: string }) {
  const { view, reason } = useResolvedView();
  const viewMode = usePreferencesStore((s) => s.viewMode);
  const setViewMode = usePreferencesStore((s) => s.setViewMode);
  const resetCamera = useSceneStore((s) => s.requestCameraReset);
  const is3D = view === "3d";

  return (
    <section
      aria-label="Process scene"
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card",
        className,
      )}
    >
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <h2 className="text-sm font-medium">Process view</h2>
        <Tooltip>
          <TooltipTrigger
            render={
              <Badge variant="outline" className="gap-1 border-warning/60">
                <InfoIcon aria-hidden />
                Illustrative
              </Badge>
            }
          />
          <TooltipContent className="max-w-64">
            A schematic of the workflow driven by validated formulation state
            and real job events. It is not a physical, molecular or mechanical
            simulation.
          </TooltipContent>
        </Tooltip>
        <div className="ml-auto flex items-center gap-1">
          <div
            role="group"
            aria-label="View mode"
            className="flex rounded-lg border p-0.5"
          >
            <Button
              size="xs"
              variant={is3D ? "secondary" : "ghost"}
              aria-pressed={is3D}
              onClick={() => setViewMode("3d")}
            >
              <BoxIcon aria-hidden /> 3D
            </Button>
            <Button
              size="xs"
              variant={!is3D && view !== "pending" ? "secondary" : "ghost"}
              aria-pressed={!is3D && view !== "pending"}
              onClick={() => setViewMode("2d")}
            >
              <SquareIcon aria-hidden /> 2D
            </Button>
          </div>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={resetCamera}
            disabled={!is3D}
            aria-label="Reset camera"
            title="Reset camera"
          >
            <RotateCcwIcon />
          </Button>
        </div>
      </header>

      <div className="relative min-h-[320px] flex-1 bg-scene-bg">
        {view === "pending" && <Skeleton className="size-full rounded-none" />}
        {view === "2d" && <Workspace2D />}
        {view === "3d" && (
          <SceneErrorBoundary fallback={<Workspace2D />}>
            <SceneCanvas />
            <SceneLabels />
          </SceneErrorBoundary>
        )}
        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-col gap-2 sm:left-auto sm:w-80">
          <JobProgress className="pointer-events-auto" />
        </div>
        {reason && viewMode === "auto" && (
          <p className="absolute top-2 left-3 rounded-md bg-popover/90 px-2 py-1 text-xs text-muted-foreground">
            {reason}
          </p>
        )}
        {is3D && (
          <p className="pointer-events-none absolute top-2 left-3 hidden text-[11px] text-muted-foreground md:block">
            Drag to orbit · scroll to zoom · right-drag to pan · click a bin to
            inspect
          </p>
        )}
      </div>

      <SceneObjectList />
      <SceneAnnouncer />
    </section>
  );
}

/** Keyboard/screen-reader equivalent of the clickable scene objects. */
function SceneObjectList() {
  const validated = useFormulationStore((s) => s.validated);
  const catalog = useFormulationStore((s) => s.catalog);
  const [selectedId, selectIngredient] = useSelectionStore(
    useShallow((s) => [s.selectedIngredientId, s.selectIngredient]),
  );
  const stages = useJobStore((s) => s.stages);
  const lines = validated?.lines ?? [];
  const selectedIngredient = selectedId ? catalog[selectedId] : null;
  const selectedLine = lines.find((l) => l.ingredient_id === selectedId);
  const issue = validated?.result.issues.find(
    (i) => i.ingredient_id === selectedId,
  );

  return (
    <div className="space-y-3 border-t p-3">
      <div>
        <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">
          Scene objects
        </h3>
        <ul className="flex flex-wrap gap-1.5">
          {lines.map((line, i) => {
            const name =
              catalog[line.ingredient_id]?.common_name ?? line.ingredient_id;
            const selected = selectedId === line.ingredient_id;
            return (
              <li key={line.ingredient_id}>
                <Button
                  size="xs"
                  variant={selected ? "secondary" : "outline"}
                  aria-pressed={selected}
                  onClick={() =>
                    selectIngredient(selected ? null : line.ingredient_id)
                  }
                >
                  <span
                    aria-hidden
                    className="size-2.5 rounded-full"
                    style={{ background: cropVar(i) }}
                  />
                  Inspect {name}
                  <span className="tabular-nums text-muted-foreground">
                    {line.percent}%
                  </span>
                </Button>
              </li>
            );
          })}
          {lines.length === 0 && (
            <li className="text-xs text-muted-foreground">
              Add ingredients to see them in the scene.
            </li>
          )}
        </ul>
      </div>

      {selectedIngredient && selectedLine && (
        <div
          className="rounded-lg border bg-muted/40 p-3 text-sm"
          aria-live="polite"
        >
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium">{selectedIngredient.common_name}</p>
              <p className="text-xs text-muted-foreground italic">
                {selectedIngredient.scientific_name}
              </p>
            </div>
            <span className="text-lg font-semibold tabular-nums">
              {selectedLine.percent}%
            </span>
          </div>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
            <dt className="text-muted-foreground">Form</dt>
            <dd>{selectedIngredient.form}</dd>
            <dt className="text-muted-foreground">Basis</dt>
            <dd>{selectedIngredient.moisture_basis}</dd>
            <dt className="text-muted-foreground">Source</dt>
            <dd>{selectedIngredient.source.name}</dd>
            <dt className="text-muted-foreground">Licence</dt>
            <dd>{selectedIngredient.source.license_status}</dd>
          </dl>
          {issue && (
            <p className="mt-2 text-xs text-destructive">{issue.message}</p>
          )}
        </div>
      )}

      <ul
        className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"
        aria-label="Stage status"
      >
        {PROCESS_STATIONS.map((s) => (
          <li key={s.id}>
            {s.label}:{" "}
            <span className="text-foreground">
              {STAGE_STATUS_TEXT[stages[s.id] ?? "idle"]}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Announces stage changes for screen readers, e.g. "Predicting texture, running". */
function SceneAnnouncer() {
  const text = useJobStore((s) => {
    if (s.status === "idle") return "";
    const label = s.currentStage
      ? (s.stageLabels[s.currentStage] ?? s.currentStage)
      : "Job";
    return `${label}, ${s.status}`;
  });
  return (
    <div aria-live="polite" className="sr-only">
      {text}
    </div>
  );
}
