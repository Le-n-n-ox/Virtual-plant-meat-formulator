"use client";

import type { KeyboardEvent } from "react";
import { useShallow } from "zustand/react/shallow";
import { useFormulationStore } from "@/stores/formulationStore";
import { type StageStatus, useJobStore } from "@/stores/jobStore";
import { useSelectionStore } from "@/stores/selectionStore";
import { usePlacementStore } from "@/stores/placementStore";
import { placeHeld } from "../drag/actions";
import { startPointerDrag } from "../drag/startPointerDrag";
import {
  PROCESS_STATIONS,
  STAGE_STATUS_TEXT,
  stationStatuses,
} from "../stations";
import { cropVar } from "../theme/sceneTheme";
import { DragLayer2D } from "../drag/DragLayer2D";

const STATUS_FILL: Record<StageStatus | "idle", string> = {
  idle: "var(--scene-idle)",
  active: "var(--scene-active)",
  complete: "var(--scene-complete)",
  warning: "var(--scene-warning)",
  failed: "var(--scene-failed)",
  cancelled: "var(--scene-idle)",
};

const BIN_W = 96;
const BIN_H = 176;
const BIN_GAP = 16;
const BIN_TOP = 70;

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
  const { jobType, stages, status, currentStage, candidateIds } = useJobStore(
    useShallow((s) => ({
      jobType: s.jobType,
      stages: s.stages,
      status: s.status,
      currentStage: s.currentStage,
      candidateIds: s.candidateIds,
    })),
  );
  const statuses = stationStatuses({ jobType, status, stages, currentStage });
  const selectedCandidate = useSelectionStore((s) => s.selectedCandidateId);
  const candidateId = selectedCandidate ?? candidateIds.at(-1) ?? null;

  const lines = validated?.lines ?? [];
  const draft = useFormulationStore((s) => s.draft);
  const invalid = new Set(validated?.result.issues.map((i) => i.ingredient_id));
  /** Dropped but not yet in a validation snapshot: translucent and dashed. */
  const pendingIds = new Set(
    draft
      .map((l) => l.ingredient_id)
      .filter((id) => !lines.some((l) => l.ingredient_id === id)),
  );
  const held = usePlacementStore((s) => s.held);
  const binsX = 40;
  const running = status === "running" || status === "queued";
  const total = lines.reduce(
    (sum, l) => sum + (Number.isFinite(l.percent) ? l.percent : 0),
    0,
  );

  const onKey = (id: string) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      selectIngredient(selectedId === id ? null : id);
    }
  };

  // Stacked composition bar geometry (percent of mass, validated).
  const barX = 60;
  const barW = 680;
  const { segments, cursor } = lines.reduce(
    (acc, line, i) => {
      const w = (Math.max(0, line.percent) / 100) * barW;
      acc.segments.push({ x: acc.cursor, w, i, line });
      acc.cursor += w;
      return acc;
    },
    {
      segments: [] as {
        x: number;
        w: number;
        i: number;
        line: (typeof lines)[number];
      }[],
      cursor: barX,
    },
  );
  const remainder = Math.max(0, barX + barW - cursor);

  return (
    <svg
      id="scene-2d"
      viewBox="0 0 800 760"
      className="scene-panel h-full w-full"
      role="group"
      aria-label="2D process schematic"
      preserveAspectRatio="xMidYMid meet"
    >
      <DragLayer2D />
      <defs>
        <pattern
          id="scene-grid"
          width="36"
          height="36"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 36 0 L 0 0 0 36"
            fill="none"
            stroke="var(--scene-line)"
            strokeWidth="1"
          />
        </pattern>
        <linearGradient id="scene-floor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--scene-floor)" />
          <stop offset="100%" stopColor="var(--scene-bg-2)" />
        </linearGradient>
      </defs>

      <rect
        x="0"
        y="0"
        width="800"
        height="760"
        fill="url(#scene-grid)"
        opacity="0.5"
      />

      {/* Caption + legend */}
      <text
        x="40"
        y="34"
        fontSize="13"
        fontWeight="600"
        fill="var(--foreground)"
      >
        Process schematic
      </text>
      <text x="40" y="52" fontSize="11" fill="var(--muted-foreground)">
        Illustrative · driven by validated formulation state
      </text>
      <g aria-hidden>
        {(
          [
            ["active", "Running"],
            ["complete", "Complete"],
            ["warning", "Warning"],
            ["failed", "Failed"],
          ] as const
        ).map(([key, label], i) => {
          const x = 520 + (i % 2) * 130;
          const y = 30 + Math.floor(i / 2) * 22;
          return (
            <g key={key}>
              <circle cx={x} cy={y - 4} r="5" fill={STATUS_FILL[key]} />
              <text
                x={x + 12}
                y={y}
                fontSize="11"
                fill="var(--muted-foreground)"
              >
                {label}
              </text>
            </g>
          );
        })}
      </g>

      {/* Ingredient bins */}
      {lines.map((line, i) => {
        const x = binsX + i * (BIN_W + BIN_GAP);
        const fillH = Math.max(
          3,
          (BIN_H - 12) * Math.min(1, line.percent / 100),
        );
        const selected = selectedId === line.ingredient_id;
        const bad = invalid.has(line.ingredient_id);
        const name =
          catalog[line.ingredient_id]?.common_name ?? line.ingredient_id;
        const clipId = `bin-clip-${line.ingredient_id}`;
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
            onPointerDown={startPointerDrag({
              kind: "bin",
              id: line.ingredient_id,
              label: name,
              source: "view2d",
            })}
            className="cursor-grab outline-none active:cursor-grabbing"
          >
            <defs>
              <clipPath id={clipId}>
                <rect
                  x={x + 5}
                  y={BIN_TOP + 5}
                  width={BIN_W - 10}
                  height={BIN_H - 10}
                  rx="9"
                />
              </clipPath>
            </defs>

            {/* Feed pipe to the vessel */}
            <path
              d={`M ${x + BIN_W / 2} ${BIN_TOP + BIN_H + 6} C ${x + BIN_W / 2} 320, 420 220, 452 200`}
              fill="none"
              stroke={
                selected ? "var(--scene-accent)" : "var(--scene-grid-strong)"
              }
              strokeWidth={selected ? 4 : 2.5}
              className={selected || running ? "scene-flow-dash" : undefined}
            />

            <rect
              x={x}
              y={BIN_TOP}
              width={BIN_W}
              height={BIN_H}
              rx="12"
              fill="var(--scene-metal)"
              fillOpacity={pendingIds.has(line.ingredient_id) ? 0.12 : 0.25}
              stroke={
                bad
                  ? "var(--scene-failed)"
                  : selected
                    ? "var(--scene-accent)"
                    : "var(--scene-line)"
              }
              strokeWidth={bad || selected ? 3.5 : 1.5}
              strokeDasharray={
                pendingIds.has(line.ingredient_id) ? "6 4" : undefined
              }
            />
            <g clipPath={`url(#${clipId})`}>
              <rect
                x={x + 5}
                y={BIN_TOP + BIN_H - 5 - fillH}
                width={BIN_W - 10}
                height={fillH}
                fill={cropVar(i)}
                style={{ transition: "y 0.5s ease, height 0.5s ease" }}
              />
            </g>
            {[0.33, 0.66].map((t) => (
              <line
                key={t}
                x1={x + 10}
                x2={x + BIN_W - 10}
                y1={BIN_TOP + BIN_H * t}
                y2={BIN_TOP + BIN_H * t}
                stroke="var(--scene-line)"
                strokeWidth="1"
              />
            ))}
            <text
              x={x + BIN_W / 2}
              y={BIN_TOP + BIN_H + 28}
              textAnchor="middle"
              fontSize="12"
              fill="var(--foreground)"
            >
              {name.length > 14 ? `${name.slice(0, 13)}…` : name}
            </text>
            <text
              x={x + BIN_W / 2}
              y={BIN_TOP + BIN_H + 46}
              textAnchor="middle"
              fontSize="12"
              fill="var(--muted-foreground)"
            >
              {line.percent}%
            </text>
          </g>
        );
      })}
      {lines.length === 0 && (
        <text
          x="200"
          y="180"
          textAnchor="middle"
          fontSize="14"
          fill="var(--muted-foreground)"
        >
          No validated ingredients yet
        </text>
      )}

      {/* Mixing vessel */}
      <g
        id="drag-target-vessel"
        aria-label={`Mixing: ${STAGE_STATUS_TEXT[statuses.mixing ?? "idle"]}`}
        role="img"
        onClick={() => {
          if (!held) return;
          void placeHeld(
            held,
            "vessel",
            useFormulationStore.getState().catalog,
          );
        }}
        className="cursor-pointer"
      >
        <path
          d="M 550 380 C 610 380, 590 470, 640 470"
          fill="none"
          stroke="var(--scene-grid-strong)"
          strokeWidth="3"
          className={running ? "scene-flow-dash" : undefined}
        />
        <path
          d="M 430 170 L 452 400 L 528 400 L 550 170 Z"
          fill="var(--scene-metal)"
          fillOpacity="0.45"
          stroke={
            statuses.mixing
              ? STATUS_FILL[statuses.mixing]
              : validated && !validated.result.valid
                ? "var(--scene-warning)"
                : "var(--scene-line)"
          }
          strokeWidth="4"
        />
        <g
          style={{
            transformBox: "view-box",
            transformOrigin: "490px 300px",
            animation: running
              ? "scene-spin-slow 5s linear infinite"
              : undefined,
          }}
        >
          <line
            x1="490"
            y1="220"
            x2="490"
            y2="380"
            stroke="var(--scene-foreground)"
            strokeWidth="4"
          />
          <line
            x1="452"
            y1="330"
            x2="528"
            y2="330"
            stroke="var(--scene-foreground)"
            strokeWidth="4"
          />
        </g>
        <circle
          cx="462"
          cy="260"
          r="4"
          fill="var(--scene-foreground)"
          opacity="0.4"
        />
        <circle
          cx="516"
          cy="248"
          r="3"
          fill="var(--scene-foreground)"
          opacity="0.35"
        />
        <text
          x="490"
          y="156"
          textAnchor="middle"
          fontSize="13"
          fill="var(--foreground)"
        >
          Mixing · {STAGE_STATUS_TEXT[statuses.mixing ?? "idle"]}
        </text>
      </g>

      {/* Conveyor */}
      <rect
        x="60"
        y="466"
        width="680"
        height="18"
        rx="9"
        fill="var(--scene-metal)"
      />
      <line
        x1="70"
        y1="475"
        x2="730"
        y2="475"
        stroke="var(--scene-grid-strong)"
        strokeWidth="4"
        className={running ? "scene-flow-dash" : undefined}
      />

      {/* Stations */}
      {PROCESS_STATIONS.filter((s) => s.id !== "mixing").map((station, i) => {
        const st = statuses[station.id];
        const x = 110 + i * 200;
        const active = st === "active";
        return (
          <g
            key={station.id}
            role="img"
            aria-label={`${station.label}: ${STAGE_STATUS_TEXT[st ?? "idle"]}`}
          >
            <circle
              cx={x + 40}
              cy={352}
              r="6"
              fill={STATUS_FILL[st ?? "idle"]}
              className={active ? "scene-pulse" : undefined}
            />
            <text
              x={x + 40}
              y={338}
              textAnchor="middle"
              fontSize="13"
              fill="var(--foreground)"
            >
              {station.label}
            </text>
            <rect
              x={x}
              y={368}
              width="80"
              height="20"
              rx="10"
              fill={STATUS_FILL[st ?? "idle"]}
              fillOpacity={st ? 0.9 : 0.5}
              stroke={active ? "var(--scene-active)" : "transparent"}
              strokeWidth="2"
            />
            <text
              x={x + 40}
              y={424}
              textAnchor="middle"
              fontSize="12"
              fill="var(--muted-foreground)"
            >
              {STAGE_STATUS_TEXT[st ?? "idle"]}
            </text>
            <line
              x1={x + 40}
              y1={392}
              x2={x + 40}
              y2={462}
              stroke="var(--scene-grid)"
              strokeWidth="2"
              className={active ? "scene-flow-dash" : undefined}
            />
          </g>
        );
      })}

      {/* Candidate */}
      {candidateId && (
        <g
          role="img"
          aria-label={`Candidate ${candidateId}, illustrative preview`}
          style={{ transformBox: "fill-box", transformOrigin: "center" }}
          className="scene-float"
        >
          <path
            d="M 700 470 C 770 470, 760 300, 726 250"
            fill="none"
            stroke="var(--scene-grid-strong)"
            strokeWidth="3"
            className="scene-flow-dash"
          />
          <rect
            x="640"
            y="90"
            width="110"
            height="64"
            rx="16"
            fill="var(--scene-product)"
          />
          {[0, 1, 2, 3, 4].map((k) => (
            <line
              key={k}
              x1="656"
              x2="734"
              y1={104 + k * 10}
              y2={104 + k * 10}
              stroke="var(--background)"
              strokeOpacity="0.35"
            />
          ))}
          <text
            x="695"
            y="176"
            textAnchor="middle"
            fontSize="12"
            fill="var(--foreground)"
          >
            {candidateId}
          </text>
          <text
            x="695"
            y="192"
            textAnchor="middle"
            fontSize="11"
            fill="var(--muted-foreground)"
          >
            Illustrative
          </text>
        </g>
      )}

      {/* Validated composition bar */}
      {lines.length > 0 && (
        <g aria-label={`Validated composition, total ${total} percent of mass`}>
          <text
            x="60"
            y="560"
            fontSize="13"
            fontWeight="600"
            fill="var(--foreground)"
          >
            Validated composition
          </text>
          <text
            x="740"
            y="560"
            textAnchor="end"
            fontSize="11"
            fill="var(--muted-foreground)"
          >
            Total {Math.round(total * 100) / 100}% of mass
          </text>
          <rect
            x={barX}
            y={574}
            width={barW}
            height={28}
            rx="9"
            fill="var(--scene-metal)"
            fillOpacity="0.3"
          />
          {segments.map(({ x, w, i, line }) => (
            <rect
              key={line.ingredient_id}
              x={x}
              y={574}
              width={Math.max(0, w - 1)}
              height={28}
              fill={cropVar(i)}
              stroke="var(--scene-bg)"
              strokeWidth="1"
            />
          ))}
          {remainder > 0.5 && (
            <rect
              x={cursor}
              y={574}
              width={remainder}
              height={28}
              rx="9"
              fill="var(--scene-idle)"
              fillOpacity="0.4"
            />
          )}
          {segments
            .filter(({ w }) => w > 46)
            .map(({ x, w, line }) => (
              <text
                key={`label-${line.ingredient_id}`}
                x={x + w / 2}
                y={622}
                textAnchor="middle"
                fontSize="11"
                fill="var(--foreground)"
              >
                {catalog[line.ingredient_id]?.common_name ?? line.ingredient_id}{" "}
                {line.percent}%
              </text>
            ))}
        </g>
      )}

      <rect
        x="16"
        y="660"
        width="768"
        height="70"
        rx="12"
        fill="url(#scene-floor)"
        opacity="0.7"
      />
      <text x="40" y="690" fontSize="11" fill="var(--muted-foreground)">
        3D view shows the same validated state in space. Switch with the 3D/2D
        toggle above.
      </text>
      <text x="40" y="710" fontSize="11" fill="var(--muted-foreground)">
        Animation is decorative; stage status comes from worker events only.
      </text>
    </svg>
  );
}
