"use client";

import { useShallow } from "zustand/react/shallow";
import { cn } from "@/lib/utils";
import { useFormulationStore } from "@/stores/formulationStore";
import { useJobStore } from "@/stores/jobStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { SceneLabel, SceneLabelLayer } from "./labels";
import {
  LABEL_HEIGHT,
  PROCESS_STATIONS,
  PRODUCT_POSITION,
  STAGE_STATUS_TEXT,
  STATION_X,
  binPosition,
} from "./stations";

const pill =
  "rounded-md border bg-popover/90 px-1.5 py-0.5 text-center text-[11px] leading-tight whitespace-nowrap text-popover-foreground shadow-sm backdrop-blur transition-opacity";

/** DOM labels for the 3D scene, positioned by <LabelProjector/>. Same stores as the scene. */
export function SceneLabels() {
  const validated = useFormulationStore((s) => s.validated);
  const catalog = useFormulationStore((s) => s.catalog);
  const selectedId = useSelectionStore((s) => s.selectedIngredientId);
  const selectedCandidate = useSelectionStore((s) => s.selectedCandidateId);
  const { stages, candidateIds } = useJobStore(
    useShallow((s) => ({ stages: s.stages, candidateIds: s.candidateIds })),
  );
  const lines = validated?.lines ?? [];
  const invalid = new Set(validated?.result.issues.map((i) => i.ingredient_id));
  const candidateId = selectedCandidate ?? candidateIds.at(-1) ?? null;

  return (
    <SceneLabelLayer>
      {lines.map((line, i) => {
        const [x, , z] = binPosition(i, lines.length);
        const name =
          catalog[line.ingredient_id]?.common_name ?? line.ingredient_id;
        return (
          <SceneLabel
            key={line.ingredient_id}
            id={`bin:${line.ingredient_id}`}
            position={[x, LABEL_HEIGHT.bin, z]}
          >
            <div
              className={cn(
                pill,
                "rounded-full px-2",
                selectedId === line.ingredient_id && "border-primary",
                invalid.has(line.ingredient_id) && "border-destructive",
              )}
            >
              <span className="font-medium">{name}</span>{" "}
              <span className="text-muted-foreground tabular-nums">
                {line.percent}%
              </span>
            </div>
          </SceneLabel>
        );
      })}

      {PROCESS_STATIONS.filter((s) => s.id !== "mixing").map((station) => {
        const status = stages[station.id];
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
                "text-[10px]",
                status === "active" && "border-info",
                status === "complete" && "border-success",
                status === "warning" && "border-warning",
                status === "failed" && "border-destructive",
              )}
            >
              <div className="font-medium">{station.label}</div>
              <div className="text-muted-foreground">
                {STAGE_STATUS_TEXT[status ?? "idle"]}
              </div>
            </div>
          </SceneLabel>
        );
      })}

      {candidateId && (
        <SceneLabel
          id="product"
          position={[PRODUCT_POSITION[0], LABEL_HEIGHT.product, 0]}
        >
          <div className={cn(pill, "border-warning/60 text-[10px]")}>
            <div className="font-medium">{candidateId}</div>
            <div className="text-muted-foreground">Illustrative preview</div>
          </div>
        </SceneLabel>
      )}
    </SceneLabelLayer>
  );
}
