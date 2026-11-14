"use client";

import type { KeyboardEvent } from "react";
import { useShallow } from "zustand/react/shallow";
import { useFormulationStore } from "@/stores/formulationStore";
import { type StageStatus, useJobStore } from "@/stores/jobStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { PROCESS_STATIONS, STAGE_STATUS_TEXT } from "../stations";
import { cropVar } from "../theme/sceneTheme";

const STATUS_FILL: Record<StageStatus | "idle", string> = {
  idle: "var(--scene-idle)",
  active: "var(--scene-active)",
  complete: "var(--scene-complete)",
  warning: "var(--scene-warning)",
  failed: "var(--scene-failed)",
  cancelled: "var(--scene-idle)",
};

/**
 * 2D schematic equivalent of the 3D scene: same data, same selection, same
 * stage status. Used when WebGL is unavailable, reduced motion is on, or the
 * user prefers 2D. Colours come straight from the CSS theme tokens.
 */
export function Workspace2D() {
  const validated = useFormulationStore((s) => s.validated);
  const catalog = useFormulationStore((s) => s.catalog);
  const [selectedId, selectIngredient] = useSelectionStore(
    useShallow((s) => [s.selectedIngredientId, s.selectIngredient]),
  );
  const { stages, candidateIds } = useJobStore(
    useShallow((s) => ({ stages: s.stages, candidateIds: s.candidateIds })),
  );
  const selectedCandidate = useSelectionStore((s) => s.selectedCandidateId);
  const candidateId = selectedCandidate ?? candidateIds.at(-1) ?? null;

  const lines = validated?.lines ?? [];
  const invalid = new Set(validated?.result.issues.map((i) => i.ingredient_id));
  const binW = 64;
  const gap = 14;
  const binsWidth = Math.max(1, lines.length) * (binW + gap) - gap;
  const binsX = Math.max(20, 220 - binsWidth / 2);

  const onKey = (id: string) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectIngredient(selectedId === id ? null : id);
    }
  };

  return (
    <svg
      viewBox="0 0 880 360"
      className="h-full w-full"
      style={{ background: "var(--scene-bg)" }}
      role="group"
      aria-label="2D process schematic"
    >
      <rect
        x="10"
        y="300"
        width="860"
        height="40"
        rx="10"
        fill="var(--scene-floor)"
      />

      {/* Ingredient bins */}
      {lines.map((line, i) => {
        const x = binsX + i * (binW + gap);
        const h = 110;
        const fillH = Math.max(3, (h - 8) * Math.min(1, line.percent / 100));
        const selected = selectedId === line.ingredient_id;
        const bad = invalid.has(line.ingredient_id);
        const name =
          catalog[line.ingredient_id]?.common_name ?? line.ingredient_id;
        return (
          <g
            key={line.ingredient_id}
            role="button"
            tabIndex={0}
            aria-pressed={selected}
            aria-label={`${name}, ${line.percent} percent${bad ? ", has a validation issue" : ""}`}
            onClick={() =>
              selectIngredient(selected ? null : line.ingredient_id)
            }
            onKeyDown={onKey(line.ingredient_id)}
            className="cursor-pointer outline-none [&:focus-visible>rect:first-child]:stroke-[var(--ring)]"
          >
            <rect
              x={x}
              y={60}
              width={binW}
              height={h}
              rx="8"
              fill="var(--scene-metal)"
              stroke={
                bad
                  ? "var(--scene-failed)"
                  : selected
                    ? "var(--scene-accent)"
                    : "transparent"
              }
              strokeWidth="4"
            />
            <rect
              x={x + 4}
              y={60 + h - 4 - fillH}
              width={binW - 8}
              height={fillH}
              rx="5"
              fill={cropVar(i)}
            />
            <text
              x={x + binW / 2}
              y={190}
              textAnchor="middle"
              fontSize="12"
              fill="var(--foreground)"
            >
              {name.length > 11 ? `${name.slice(0, 10)}…` : name}
            </text>
            <text
              x={x + binW / 2}
              y={206}
              textAnchor="middle"
              fontSize="11"
              fill="var(--muted-foreground)"
            >
              {line.percent}%
            </text>
            <path
              d={`M ${x + binW / 2} 214 Q ${x + binW / 2} 250 ${430} 250`}
              fill="none"
              stroke="var(--scene-grid)"
              strokeDasharray="4 4"
            />
          </g>
        );
      })}
      {lines.length === 0 && (
        <text
          x="220"
          y="130"
          textAnchor="middle"
          fontSize="13"
          fill="var(--muted-foreground)"
        >
          No validated ingredients yet
        </text>
      )}

      {/* Mixing vessel */}
      <g
        aria-label={`Mixing: ${STAGE_STATUS_TEXT[stages.mixing ?? "idle"]}`}
        role="img"
      >
        <path
          d="M 410 230 L 420 296 L 500 296 L 510 230 Z"
          fill="var(--scene-metal)"
          stroke={
            stages.mixing
              ? STATUS_FILL[stages.mixing]
              : validated && !validated.result.valid
                ? "var(--scene-warning)"
                : STATUS_FILL.idle
          }
          strokeWidth="4"
        />
        <text
          x="460"
          y="222"
          textAnchor="middle"
          fontSize="12"
          fill="var(--foreground)"
        >
          Mixing ·{" "}
          {stages.mixing
            ? STAGE_STATUS_TEXT[stages.mixing]
            : validated && !validated.result.valid
              ? "Check total"
              : "Idle"}
        </text>
      </g>

      {/* Stations */}
      {PROCESS_STATIONS.filter((s) => s.id !== "mixing").map((station, i) => {
        const status = stages[station.id];
        const x = 540 + i * 95;
        return (
          <g
            key={station.id}
            role="img"
            aria-label={`${station.label}: ${STAGE_STATUS_TEXT[status ?? "idle"]}`}
          >
            <text
              x={x + 42}
              y={244}
              textAnchor="middle"
              fontSize="12"
              fill="var(--foreground)"
            >
              {station.label}
            </text>
            <rect
              x={x}
              y={254}
              width="84"
              height="12"
              rx="6"
              fill={STATUS_FILL[status ?? "idle"]}
            />
            <text
              x={x + 42}
              y={284}
              textAnchor="middle"
              fontSize="11"
              fill="var(--muted-foreground)"
            >
              {STAGE_STATUS_TEXT[status ?? "idle"]}
            </text>
          </g>
        );
      })}

      {/* Candidate */}
      {candidateId && (
        <g
          role="img"
          aria-label={`Candidate ${candidateId}, illustrative preview`}
        >
          <rect
            x="760"
            y="120"
            width="100"
            height="56"
            rx="14"
            fill="var(--scene-product)"
          />
          {[0, 1, 2, 3].map((k) => (
            <line
              key={k}
              x1="772"
              x2="848"
              y1={134 + k * 10}
              y2={134 + k * 10}
              stroke="var(--background)"
              strokeOpacity="0.35"
            />
          ))}
          <text
            x="810"
            y="196"
            textAnchor="middle"
            fontSize="11"
            fill="var(--foreground)"
          >
            {candidateId}
          </text>
          <text
            x="810"
            y="210"
            textAnchor="middle"
            fontSize="10"
            fill="var(--muted-foreground)"
          >
            Illustrative
          </text>
        </g>
      )}
    </svg>
  );
}
