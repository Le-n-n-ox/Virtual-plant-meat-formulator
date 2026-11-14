"use client";

import { BoxIcon, InfoIcon, RotateCcwIcon, SquareIcon } from "lucide-react";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { useRef, useState } from "react";
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
import { getIngredient } from "@/lib/api/ingredients";
import { getIngredientDragId, isIngredientDrag } from "@/lib/dnd";
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
  loading: () => (
    <div className="scene-panel size-full">
      <Skeleton className="size-full rounded-none" />
    </div>
  ),
});

/**
 * Scene panel used by the formulation workspace: 3D canvas (or 2D fallback),
 * toolbar, live status overlay, a drop target for ingredients, and a
 * keyboard-accessible mirror of every selectable object.
 */
export function WorkspaceScene({ className }: { className?: string }) {
  const { view, reason } = useResolvedView();
  const viewMode = usePreferencesStore((s) => s.viewMode);
  const setViewMode = usePreferencesStore((s) => s.setViewMode);
  const resetCamera = useSceneStore((s) => s.requestCameraReset);
  const jobStatus = useJobStore((s) => s.status);
  const is3D = view === "3d";

  const [dropActive, setDropActive] = useState(false);
  const [dropError, setDropError] = useState<string | null>(null);
  const dragDepth = useRef(0);

  /** Drop anywhere on the scene adds the dragged crop to the formulation. */
  async function handleSceneDrop(event: React.DragEvent) {
    event.preventDefault();
    dragDepth.current = 0;
    setDropActive(false);
    const id = getIngredientDragId(event);
    if (!id) return;
    const store = useFormulationStore.getState();
    if (store.draft.some((line) => line.ingredient_id === id)) {
      setDropError(null);
      return;
    }
    try {
      const ingredient = store.catalog[id] ?? (await getIngredient(id));
      useFormulationStore.getState().addIngredient(ingredient);
      setDropError(null);
    } catch {
      setDropError("That ingredient could not be loaded.");
    }
  }

  return (
    <section
      aria-label="Process scene"
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-xl border bg-card shadow-sm",
        className,
      )}
    >
      <header className="flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <span
          aria-hidden
          className={cn(
            "size-2 rounded-full",
            jobStatus === "running" && "scene-pulse bg-info",
            jobStatus === "completed" && "bg-success",
            jobStatus === "failed" && "bg-destructive",
            jobStatus === "cancelled" && "bg-muted-foreground",
            (jobStatus === "idle" || jobStatus === "queued") &&
              "bg-muted-foreground",
          )}
        />
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
            className="relative flex rounded-lg border p-0.5"
          >
            {(
              [
                { id: "3d", label: "3D", icon: BoxIcon },
                { id: "2d", label: "2D", icon: SquareIcon },
              ] as const
            ).map(({ id, label, icon: Icon }) => {
              const active = id === "3d" ? is3D : view === "2d";
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setViewMode(id)}
                  className={cn(
                    "relative z-10 flex items-center gap-1 rounded-md px-2 py-1 text-xs transition-colors outline-none focus-visible:bg-muted",
                    active
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="view-mode-pill"
                      className="absolute inset-0 -z-10 rounded-md bg-secondary"
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 40,
                      }}
                    />
                  )}
                  <Icon aria-hidden className="size-3.5" /> {label}
                </button>
              );
            })}
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

      <div
        className={cn(
          "scene-panel relative min-h-[320px] flex-1",
          dropActive && "ring-2 ring-primary ring-inset",
        )}
        onDragEnter={(e) => {
          if (!isIngredientDrag(e)) return;
          e.preventDefault();
          dragDepth.current += 1;
          setDropActive(true);
        }}
        onDragOver={(e) => {
          if (!isIngredientDrag(e)) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={() => {
          dragDepth.current -= 1;
          if (dragDepth.current <= 0) {
            dragDepth.current = 0;
            setDropActive(false);
          }
        }}
        onDrop={handleSceneDrop}
      >
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
          <p className="absolute top-2 left-3 rounded-md bg-popover/90 px-2 py-1 text-xs text-muted-foreground shadow-sm backdrop-blur">
            {reason}
          </p>
        )}
        {is3D && !dropActive && (
          <p className="pointer-events-none absolute top-2 left-3 hidden text-[11px] text-muted-foreground md:block">
            Drag to orbit · scroll to zoom · click a bin to inspect · drop a
            crop here to add it
          </p>
        )}

        {dropActive && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-primary/10 backdrop-blur-[1px]">
            <div className="rounded-xl border border-primary/50 bg-popover/95 px-4 py-3 text-center shadow-lg">
              <p className="text-sm font-medium">
                Drop to add to the formulation
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Release to place it in the scene
              </p>
            </div>
          </div>
        )}
        {dropError && (
          <p className="absolute top-2 right-3 rounded-md bg-destructive/15 px-2 py-1 text-xs text-destructive">
            {dropError}
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
  const [replaceTarget, setReplaceTarget] = useState<string | null>(null);
  const lines = validated?.lines ?? [];
  const selectedIngredient = selectedId ? catalog[selectedId] : null;
  const selectedLine = lines.find((l) => l.ingredient_id === selectedId);
  const issue = validated?.result.issues.find(
    (i) => i.ingredient_id === selectedId,
  );

  /** Drop on a bin chip to swap that ingredient for the dragged one. */
  function handleReplace(event: React.DragEvent, currentId: string) {
    event.preventDefault();
    event.stopPropagation();
    setReplaceTarget(null);
    const id = getIngredientDragId(event);
    if (!id || id === currentId) return;

    const apply = (ingredient: Awaited<ReturnType<typeof getIngredient>>) => {
      const store = useFormulationStore.getState();
      const percent =
        store.draft.find((line) => line.ingredient_id === currentId)?.percent ??
        0;
      store.removeIngredient(currentId);
      store.addIngredient(ingredient, percent);
    };

    const knownIngredient = useFormulationStore.getState().catalog[id];
    if (knownIngredient) {
      apply(knownIngredient);
      return;
    }
    void getIngredient(id)
      .then(apply)
      .catch(() => undefined);
  }

  return (
    <div className="scene-scroll space-y-3 border-t p-3">
      <div>
        <h3 className="mb-1.5 text-xs font-medium text-muted-foreground">
          Scene objects
        </h3>
        <ul className="flex flex-wrap gap-1.5">
          {lines.map((line, i) => {
            const name =
              catalog[line.ingredient_id]?.common_name ?? line.ingredient_id;
            const selected = selectedId === line.ingredient_id;
            const replaceable = replaceTarget === line.ingredient_id;
            return (
              <li key={line.ingredient_id}>
                <Button
                  size="xs"
                  variant={selected ? "secondary" : "outline"}
                  aria-pressed={selected}
                  aria-label={`${name}, ${line.percent} percent. Drop a crop here to replace it.`}
                  onClick={() =>
                    selectIngredient(selected ? null : line.ingredient_id)
                  }
                  onDragOver={(e) => {
                    if (!isIngredientDrag(e)) return;
                    e.preventDefault();
                    e.stopPropagation();
                    setReplaceTarget(line.ingredient_id);
                  }}
                  onDragLeave={() => setReplaceTarget(null)}
                  onDrop={(e) => handleReplace(e, line.ingredient_id)}
                  className={cn(replaceable && "ring-2 ring-primary")}
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
              Drag a crop into the scene to add it.
            </li>
          )}
        </ul>
      </div>

      {selectedIngredient && selectedLine && (
        <div
          className="scene-rise rounded-lg border bg-muted/40 p-3 text-sm"
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
