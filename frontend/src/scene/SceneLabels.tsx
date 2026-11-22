"use client";

import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { useFormulationStore } from "@/stores/formulationStore";
import { useJobStore } from "@/stores/jobStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { SceneLabel, SceneLabelLayer } from "./labels";
import {
  currentStageLabel,
  LABEL_HEIGHT,
  PROCESS_STATIONS,
  PRODUCT_POSITION,
  STAGE_STATUS_TEXT,
  STATION_X,
  binPosition,
  stationStatuses,
} from "./stations";

const pill =
  "rounded-lg border bg-popover/85 px-2 py-1 text-center text-[11px] leading-tight whitespace-nowrap text-popover-foreground shadow-md shadow-black/10 backdrop-blur transition-colors";

/** DOM labels for the 3D scene, positioned by <LabelProjector/>. Same stores as the scene. */
export function SceneLabels() {
  const validated = useFormulationStore((s) => s.validated);
  const catalog = useFormulationStore((s) => s.catalog);
  const selectedId = useSelectionStore((s) => s.selectedIngredientId);
  const selectedCandidate = useSelectionStore((s) => s.selectedCandidateId);
  const {
    jobType,
    status,
    stages,
    stageLabels,
    currentStage,
    candidateIds,
    progress,
  } = useJobStore(
    useShallow((s) => ({
      jobType: s.jobType,
      status: s.status,
      stages: s.stages,
      stageLabels: s.stageLabels,
      currentStage: s.currentStage,
      candidateIds: s.candidateIds,
      progress: s.progressPercent,
    })),
  );
  const statuses = stationStatuses({ jobType, status, stages, currentStage });
  const stageLabel = currentStageLabel({ currentStage, stageLabels });
  const lines = validated?.lines ?? [];
  const invalid = new Set(validated?.result.issues.map((i) => i.ingredient_id));
  const candidateId = selectedCandidate ?? candidateIds.at(-1) ?? null;

  return (
    <SceneLabelLayer>
      {lines.map((line, i) => {
        const [bx, , bz] = binPosition(i, lines.length);
        const len = Math.hypot(bx, bz) || 1;
        // Nudge the label outward so it clears the vessel rim.
        const x = bx + (bx / len) * 0.35;
        const z = bz + (bz / len) * 0.35;
        const name =
          catalog[line.ingredient_id]?.common_name ?? line.ingredient_id;
        return (
          <SceneLabel
            key={line.ingredient_id}
            id={`bin:${line.ingredient_id}`}
            position={[x, 1.95, z]}
          >
            <div
              className={cn(
                pill,
                "rounded-full",
                selectedId === line.ingredient_id && "border-primary",
                invalid.has(line.ingredient_id) && "border-destructive",
              )}
            >
              <span
                aria-hidden
                className="mr-1 inline-block size-2 rounded-full align-middle"
                style={{ background: `var(--scene-crop-${(i % 6) + 1})` }}
              />
              <span className="font-medium">{name}</span>{" "}
              <span className="text-muted-foreground tabular-nums">
                {line.percent}%
              </span>
            </div>
          </SceneLabel>
        );
      })}

      {PROCESS_STATIONS.filter((s) => s.id !== "mixing").map((station) => {
        const status = statuses[station.id];
        const active = status === "active";
        return (
          <SceneLabel
            key={station.id}
            id={`station:${station.id}`}
            position={[
              STATION_X[station.id as keyof typeof STATION_X],
              LABEL_HEIGHT.station,
              0,
            ]}
          >
            <div
              className={cn(
                pill,
                "min-w-20",
                active && "border-info",
                status === "complete" && "border-success",
                status === "warning" && "border-warning",
                status === "failed" && "border-destructive",
              )}
            >
              <div className="flex items-center justify-center gap-1 font-medium">
                <span
                  aria-hidden
                  className={cn(
                    "size-1.5 rounded-full",
                    active && "scene-pulse",
                  )}
                  style={{
                    background: status
                      ? `var(--scene-${status === "cancelled" ? "idle" : status})`
                      : "var(--scene-idle)",
                  }}
                />
                {station.label}
              </div>
              <div className="text-muted-foreground">
                {status === "idle"
                  ? STAGE_STATUS_TEXT.idle
                  : (stageLabel ?? STAGE_STATUS_TEXT[status])}
              </div>
              {active && progress !== null && (
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-info transition-[width] duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </div>
          </SceneLabel>
        );
      })}

      {candidateId && (
        <SceneLabel
          id="product"
          position={[PRODUCT_POSITION[0], LABEL_HEIGHT.product, 0]}
        >
          <div className={cn(pill, "border-warning/60")}>
            <div className="font-medium">{candidateId}</div>
            <div className="text-muted-foreground">Illustrative preview</div>
          </div>
        </SceneLabel>
      )}
    </SceneLabelLayer>
  );
}
