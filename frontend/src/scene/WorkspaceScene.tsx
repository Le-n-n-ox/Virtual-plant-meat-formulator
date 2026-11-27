"use client";

import {
  BoxIcon,
  InfoIcon,
  MinusIcon,
  PlusIcon,
  RotateCcwIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import dynamic from "next/dynamic";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
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
import { useDragStore } from "@/stores/dragStore";
import { useFormulationStore } from "@/stores/formulationStore";
import { usePlacementStore } from "@/stores/placementStore";
import { usePercentStep } from "./drag/usePercentDrag";
import { stepPercent } from "./drag/percentDrag";
import { DragChip, DragGhost2D } from "./drag/DragChip";
import { Pantry, ReturnTray } from "./drag/Pantry";
import { placeHeld } from "./drag/actions";
import { PlacementBar } from "./drag/PlacementBar";
import { useJobStore } from "@/stores/jobStore";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { useSceneStore } from "@/stores/sceneStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { SceneErrorBoundary } from "./SceneErrorBoundary";
import { SceneLabels } from "./SceneLabels";
import { Workspace2D } from "./fallback/Workspace2D";
import { useResolvedView } from "./hooks/useSceneEnvironment";
import {
  PROCESS_STATIONS,
  STAGE_STATUS_TEXT,
  stationStatuses,
} from "./stations";
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
 * toolbar, live status overlay, a drop target for ingredients, a keyboard
 * mirror of every selectable object, and an ingredient detail card.
 */
export function WorkspaceScene({ className }: { className?: string }) {
  const { view, reason } = useResolvedView();
  const viewMode = usePreferencesStore((s) => s.viewMode);
  const setViewMode = usePreferencesStore((s) => s.setViewMode);
  const resetCamera = useSceneStore((s) => s.requestCameraReset);
  const jobStatus = useJobStore((s) => s.status);
  const selectedCandidateId = useSelectionStore((s) => s.selectedCandidateId);
  const candidateScene = useSelectionStore((s) => s.candidateScene);
  const cutaway = useSelectionStore((s) => s.cutaway);
  const setCutaway = useSelectionStore((s) => s.setCutaway);
  const is3D = view === "3d";
  /**
   * A cutaway may only be offered when the candidate carries a variable that a
   * calibrated model actually produced and validated; otherwise the view stays
   * labelled illustrative.
   */
  const canCutaway =
    candidateScene !== null &&
    (candidateScene.visual_basis !== "illustrative" ||
      candidateScene.variables.some((v) => v.validated));

  return (
    <section
      aria-label="Process scene"
      className={cn(
        // The same surface the Card primitive draws — ring rather than border,
        // so the scene panel's edge matches the cards it sits beside instead of
        // being a pixel heavier. Not an actual <Card>: this is a flex column
        // with its own overflow and min-height rules that Card's padding and
        // spacing tokens would fight.
        "flex min-h-0 flex-col overflow-hidden rounded-xl bg-card shadow-sm ring-1 ring-foreground/10",
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
        <h2 className="text-small font-medium">Process view</h2>
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
        {selectedCandidateId && canCutaway && (
          <label className="flex items-center gap-1.5 text-caption text-muted-foreground">
            <input
              type="checkbox"
              checked={cutaway}
              onChange={(e) => setCutaway(e.target.checked)}
            />
            Cutaway view
          </label>
        )}
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
                    "relative z-10 flex items-center gap-1 rounded-md px-2 py-1 text-caption transition-colors outline-none focus-visible:bg-muted",
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
        className="scene-panel relative min-h-[320px] flex-1"
        id="scene-canvas-wrap"
      >
        {view === "pending" && <Skeleton className="size-full rounded-none" />}
        {view === "2d" && <Workspace2D />}
        {view === "3d" && (
          <SceneErrorBoundary fallback={<Workspace2D />} label="3D scene">
            <SceneCanvas />
            <SceneLabels />
          </SceneErrorBoundary>
        )}
        <div className="pointer-events-none absolute inset-x-3 bottom-3 flex flex-col gap-2 sm:left-auto sm:w-80">
          <JobProgress className="pointer-events-auto" />
        </div>
        {reason && viewMode === "auto" && (
          <p className="absolute top-2 left-3 rounded-md bg-popover/90 px-2 py-1 text-caption text-muted-foreground shadow-sm backdrop-blur">
            {reason}
          </p>
        )}
        {is3D && (
          <p className="pointer-events-none absolute top-2 left-2 hidden text-caption text-muted-foreground md:block">
            Drag to orbit · scroll or pinch to zoom · tap a bin to inspect ·
            drag a crop from the pantry to the vessel to add it
          </p>
        )}

        {selectedCandidateId && !canCutaway && (
          <p className="pointer-events-none absolute top-10 left-3 rounded-md bg-popover/90 px-2 py-1 text-caption text-muted-foreground shadow-sm backdrop-blur">
            Illustrative visual — no validated variable for a cutaway
          </p>
        )}

        <SceneSelectionCard />

        {/* Drag and drop (guide §12.3). */}
        <Pantry />
        <ReturnTray />
        <PlacementBar />
        <DragChip />
        {view === "2d" && <DragGhost2D />}
        <DragAnnouncer />
      </div>

      <SceneObjectList />
    </section>
  );
}

/** Announces every pick-up, move over a target, drop, cancel and rejection. */
function DragAnnouncer() {
  const announcement = useDragStore((s) => s.announcement);
  return (
    <div aria-live="polite" className="sr-only">
      {announcement}
    </div>
  );
}

type SceneEntry =
  | {
      kind: "ingredient";
      id: string;
      label: string;
      percent: number;
      color: string;
    }
  | { kind: "candidate"; id: string; label: string };

/**
 * Keyboard and screen-reader equivalent of the clickable 3D objects. One Tab
 * stop enters the list; arrow keys move between objects, Enter inspects, and
 * Escape clears the selection. Every action the canvas offers is here.
 */
function SceneObjectList() {
  const validated = useFormulationStore((s) => s.validated);
  const catalog = useFormulationStore((s) => s.catalog);
  const [selectedId, selectIngredient] = useSelectionStore(
    useShallow((s) => [s.selectedIngredientId, s.selectIngredient]),
  );
  const selectedCandidate = useSelectionStore((s) => s.selectedCandidateId);
  const selectCandidate = useSelectionStore((s) => s.selectCandidate);
  const stages = useJobStore((s) => s.stages);
  const jobType = useJobStore((s) => s.jobType);
  const jobStatus = useJobStore((s) => s.status);
  const currentStage = useJobStore((s) => s.currentStage);
  const candidateIds = useJobStore((s) => s.candidateIds);
  const [activeIndex, setActiveIndex] = useState(0);
  const held = usePlacementStore((s) => s.held);
  const hold = usePlacementStore((s) => s.hold);
  const release = usePlacementStore((s) => s.release);
  const removeIngredient = useFormulationStore((s) => s.removeIngredient);
  const itemsRef = useRef<Array<HTMLButtonElement | null>>([]);
  /** Mirror of activeIndex that updates synchronously, for key handling. */
  const activeRef = useRef(0);
  const lines = validated?.lines ?? [];

  const entries: SceneEntry[] = [
    ...lines.map((line, index) => ({
      kind: "ingredient" as const,
      id: line.ingredient_id,
      label: catalog[line.ingredient_id]?.common_name ?? line.ingredient_id,
      percent: line.percent,
      color: cropVar(index),
    })),
    ...(candidateIds.length > 0
      ? [
          {
            kind: "candidate" as const,
            id: candidateIds[candidateIds.length - 1],
            label: "Candidate product",
          },
        ]
      : []),
  ];

  /** Clamp during render rather than syncing state in an effect. */
  const active = Math.max(0, Math.min(activeIndex, entries.length - 1));

  /** Move the roving tabindex and focus the newly active button. */
  function moveTo(index: number) {
    const next = Math.max(0, Math.min(entries.length - 1, index));
    activeRef.current = next;
    setActiveIndex(next);
    itemsRef.current[next]?.focus();
  }

  function handleListKeyDown(event: React.KeyboardEvent) {
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        event.preventDefault();
        // Arrows adjust the percentage once the bin is selected; until then
        // they move focus through the list.
        if (selectedId && entries[activeRef.current]?.id === selectedId) {
          adjustFocused(1, event.shiftKey);
        } else {
          moveTo(activeRef.current + 1);
        }
        break;
      case "ArrowLeft":
      case "ArrowUp":
        event.preventDefault();
        if (selectedId && entries[activeRef.current]?.id === selectedId) {
          adjustFocused(-1, event.shiftKey);
        } else {
          moveTo(activeRef.current - 1);
        }
        break;
      case "Home":
        event.preventDefault();
        moveTo(0);
        break;
      case "End":
        event.preventDefault();
        moveTo(entries.length - 1);
        break;
      case "Escape":
        event.preventDefault();
        if (held) release();
        selectIngredient(null);
        selectCandidate(null);
        break;
      case " ":
      case "Spacebar": {
        event.preventDefault();
        void togglePlace(entries[activeRef.current]);
        break;
      }
      case "Delete":
      case "Backspace": {
        const entry = entries[activeRef.current];
        if (!entry || entry.kind !== "ingredient") break;
        event.preventDefault();
        removeIngredient(entry.id);
        if (held?.id === entry.id) release();
        break;
      }
      default:
        break;
    }
  }

  /** Arrow up/down on the focused bin, 0.5 steps, 0.1 with Shift. */
  function adjustFocused(direction: 1 | -1, fine: boolean) {
    const entry = entries[activeRef.current];
    if (!entry || entry.kind !== "ingredient") return;
    const store = useFormulationStore.getState();
    const current =
      store.draft.find((l) => l.ingredient_id === entry.id)?.percent ??
      entry.percent;
    store.setPercent(entry.id, stepPercent(current, direction, fine));
  }

  /** Space again places what is held; a different row switches the held item. */
  async function togglePlace(entry: SceneEntry) {
    if (entry.kind !== "ingredient") return;
    if (!held) {
      hold({ kind: entry.kind, id: entry.id, label: entry.label });
      return;
    }
    if (held.id === entry.id) {
      const catalog = useFormulationStore.getState().catalog;
      await placeHeld(held, "vessel", catalog);
      release();
      return;
    }
    hold({ kind: entry.kind, id: entry.id, label: entry.label });
  }

  return (
    <div className="scene-scroll space-y-3 border-t p-3">
      <div>
        <h3 className="mb-1.5 text-caption font-medium text-muted-foreground">
          Scene objects
        </h3>
        {entries.length === 0 ? (
          <p className="text-caption text-muted-foreground">
            Drag a crop into the scene to add it.
          </p>
        ) : (
          <ul
            className="flex flex-wrap gap-1.5"
            aria-label="Scene objects. Arrow keys move, Enter inspects, Space picks up and places, Delete removes, Escape clears. With a bin selected, arrow keys change its percentage."
            onKeyDown={handleListKeyDown}
          >
            {entries.map((entry, index) => {
              const selected =
                entry.kind === "ingredient"
                  ? selectedId === entry.id
                  : selectedCandidate === entry.id;
              return (
                <li key={`${entry.kind}-${entry.id}`}>
                  <Button
                    ref={(el) => {
                      itemsRef.current[index] = el;
                    }}
                    size="xs"
                    variant={selected ? "secondary" : "outline"}
                    tabIndex={index === active ? 0 : -1}
                    aria-pressed={selected}
                    aria-label={
                      entry.kind === "ingredient"
                        ? `${entry.label}, ${entry.percent} percent. Enter inspects. Space picks up then places in the vessel. Delete removes.`
                        : `${entry.label}. Enter inspects.`
                    }
                    onClick={() => {
                      if (entry.kind === "ingredient") {
                        selectIngredient(selected ? null : entry.id);
                      } else {
                        selectCandidate(selected ? null : entry.id);
                      }
                    }}
                    onFocus={() => {
                      activeRef.current = index;
                      setActiveIndex(index);
                    }}
                    className={cn(
                      held?.id === entry.id && "ring-2 ring-primary",
                    )}
                  >
                    {entry.kind === "ingredient" ? (
                      <span
                        aria-hidden
                        className="size-2.5 rounded-full"
                        style={{ background: entry.color }}
                      />
                    ) : (
                      <BoxIcon aria-hidden className="size-3" />
                    )}
                    {entry.kind === "ingredient"
                      ? `Inspect ${entry.label}`
                      : entry.label}
                    {entry.kind === "ingredient" && (
                      <span className="font-numeric text-muted-foreground">
                        {entry.percent}%
                      </span>
                    )}
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <ul
        className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted-foreground"
        aria-label="Stage status"
      >
        {PROCESS_STATIONS.map((s) => (
          <li key={s.id}>
            {s.label}:{" "}
            <span className="text-foreground">
              {
                STAGE_STATUS_TEXT[
                  stationStatuses({
                    jobType,
                    status: jobStatus,
                    stages,
                    currentStage,
                  })[s.id] ?? "idle"
                ]
              }
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Floating ingredient card opened by clicking a bin (or its chip). Escape or
 * the close button dismisses it and focus returns to the scene.
 */
function SceneSelectionCard() {
  const catalog = useFormulationStore((s) => s.catalog);
  const validated = useFormulationStore((s) => s.validated);
  const selectedId = useSelectionStore((s) => s.selectedIngredientId);
  const selectIngredient = useSelectionStore((s) => s.selectIngredient);
  const lines = validated?.lines ?? [];
  const ingredient = selectedId ? catalog[selectedId] : null;
  const line = lines.find((l) => l.ingredient_id === selectedId);
  const issue = validated?.result.issues.find(
    (i) => i.ingredient_id === selectedId,
  );
  const stepPercent = usePercentStep(
    ingredient?.id ?? "",
    () => line?.percent ?? 0,
  );
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (selectedId) closeRef.current?.focus();
  }, [selectedId]);

  if (!ingredient || !line) return null;

  return (
    <div
      role="region"
      aria-label="Ingredient details"
      className="scene-rise pointer-events-auto absolute top-10 right-3 z-20 w-72 max-w-[calc(100%-1.5rem)] rounded-xl border bg-popover/95 p-3 text-small shadow-lg backdrop-blur"
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          selectIngredient(null);
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{ingredient.common_name}</p>
          {ingredient.scientific_name && (
            <p className="text-caption text-muted-foreground italic">
              {ingredient.scientific_name}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-h3 font-semibold font-numeric">
            {line.percent}%
          </span>
          <div
            className="flex items-center gap-0.5"
            role="group"
            aria-label="Percentage"
          >
            <Button
              size="icon-xs"
              variant="outline"
              aria-label={`Decrease ${ingredient.common_name} percentage by half a percent`}
              onClick={(e) => stepPercent(-1, e.shiftKey)}
            >
              <MinusIcon aria-hidden />
            </Button>
            <Button
              size="icon-xs"
              variant="outline"
              aria-label={`Increase ${ingredient.common_name} percentage by half a percent`}
              onClick={(e) => stepPercent(1, e.shiftKey)}
            >
              <PlusIcon aria-hidden />
            </Button>
          </div>
          <Button
            size="xs"
            variant="outline"
            onClick={() => {
              useFormulationStore.getState().removeIngredient(ingredient.id);
              selectIngredient(null);
            }}
          >
            Remove
          </Button>
          <Button
            ref={closeRef}
            size="icon-xs"
            variant="ghost"
            aria-label="Close ingredient details"
            onClick={() => selectIngredient(null)}
          >
            <XIcon />
          </Button>
        </div>
      </div>

      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-caption">
        <dt className="text-muted-foreground">Form</dt>
        <dd>{ingredient.form}</dd>
        <dt className="text-muted-foreground">Basis</dt>
        <dd>{ingredient.moisture_basis}</dd>
        {ingredient.origin && (
          <>
            <dt className="text-muted-foreground">Origin</dt>
            <dd>{ingredient.origin}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Source</dt>
        <dd>{ingredient.source.name}</dd>
        {ingredient.source.method && (
          <>
            <dt className="text-muted-foreground">Method</dt>
            <dd>{ingredient.source.method}</dd>
          </>
        )}
        {ingredient.source.date && (
          <>
            <dt className="text-muted-foreground">Collected</dt>
            <dd>{ingredient.source.date}</dd>
          </>
        )}
        <dt className="text-muted-foreground">Licence</dt>
        <dd>{ingredient.source.license_status}</dd>
        {ingredient.source.citation && (
          <>
            <dt className="text-muted-foreground">Citation</dt>
            <dd className="line-clamp-2">{ingredient.source.citation}</dd>
          </>
        )}
      </dl>

      {issue && (
        <p className="mt-2 text-caption text-destructive">{issue.message}</p>
      )}
    </div>
  );
}
