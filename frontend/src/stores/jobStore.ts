import { create } from "zustand";
import type { JobEvent, JobStatus, JobType } from "@/types";

/**
 * Active job state. Written only by the SSE client / job REST calls (and the
 * dev-only mock scenario player). The scene and timeline read from here.
 *
 * Integrity rules (frontend guide §7):
 * - ignore events for a different job_id
 * - ignore duplicates / out-of-order events (by seq, else timestamp)
 * - never let anything overwrite a terminal state
 * - progress is a number only when the worker sent a measurable value
 */
export type StageStatus =
  "active" | "complete" | "warning" | "failed" | "cancelled";

export type ConnectionState =
  "idle" | "connecting" | "open" | "reconnecting" | "closed";

export interface JobWarning {
  stage: string;
  message: string;
  timestamp: string;
}

const TERMINAL: ReadonlySet<JobStatus> = new Set([
  "completed",
  "failed",
  "cancelled",
]);

export function isTerminal(status: JobStatus | "idle"): boolean {
  return status !== "idle" && TERMINAL.has(status);
}

interface JobState {
  activeJobId: string | null;
  jobType: JobType | null;
  status: JobStatus | "idle";
  stages: Record<string, StageStatus>;
  stageLabels: Record<string, string>;
  currentStage: string | null;
  progressPercent: number | null;
  message: string | null;
  warnings: JobWarning[];
  candidateIds: string[];
  events: JobEvent[];
  lastTimestamp: string | null;
  lastSeq: number | null;
  connection: ConnectionState;

  startJob: (jobId: string, type: JobType) => void;
  applyEvent: (event: JobEvent) => boolean;
  setConnection: (connection: ConnectionState) => void;
  reset: () => void;
}

const initial = {
  activeJobId: null,
  jobType: null,
  status: "idle" as const,
  stages: {},
  stageLabels: {},
  currentStage: null,
  progressPercent: null,
  message: null,
  warnings: [],
  candidateIds: [],
  events: [],
  lastTimestamp: null,
  lastSeq: null,
  connection: "idle" as const,
};

function measuredProgress(event: JobEvent): number | null {
  if (
    typeof event.progress_percent === "number" &&
    Number.isFinite(event.progress_percent)
  ) {
    return Math.min(100, Math.max(0, event.progress_percent));
  }
  if (
    typeof event.completed === "number" &&
    typeof event.total === "number" &&
    event.total > 0
  ) {
    return Math.min(100, Math.max(0, (event.completed / event.total) * 100));
  }
  return null;
}

export const useJobStore = create<JobState>((set, get) => ({
  ...initial,

  startJob: (jobId, type) =>
    set({
      ...initial,
      activeJobId: jobId,
      jobType: type,
      status: "queued",
      connection: "connecting",
    }),

  setConnection: (connection) => set({ connection }),

  reset: () => set(initial),

  applyEvent: (event) => {
    const s = get();
    if (!s.activeJobId || event.job_id !== s.activeJobId) return false;
    if (isTerminal(s.status)) return false;

    if (typeof event.seq === "number" && s.lastSeq !== null) {
      if (event.seq <= s.lastSeq) return false;
    } else if (s.lastTimestamp !== null) {
      if (Date.parse(event.timestamp) < Date.parse(s.lastTimestamp))
        return false;
    }

    const stages = { ...s.stages };
    const stageLabels = { ...s.stageLabels };
    let currentStage = s.currentStage;
    const warnings = [...s.warnings];
    const candidateIds = [...s.candidateIds];

    // Stage transitions: moving to a new stage closes the previous one.
    if (event.stage && event.stage !== currentStage) {
      if (currentStage && stages[currentStage] === "active") {
        stages[currentStage] = "complete";
      }
      currentStage = event.stage;
      if (!stages[currentStage] || stages[currentStage] === "active") {
        stages[currentStage] = "active";
      }
    }
    if (event.stage && event.stage_label)
      stageLabels[event.stage] = event.stage_label;

    switch (event.event) {
      case "warning.raised":
        if (event.stage) stages[event.stage] = "warning";
        warnings.push({
          stage: event.stage,
          message: event.message ?? "Warning raised by the worker.",
          timestamp: event.timestamp,
        });
        break;
      case "candidate.ready":
        if (event.candidate_id && !candidateIds.includes(event.candidate_id)) {
          candidateIds.push(event.candidate_id);
        }
        break;
      case "job.completed":
        if (currentStage && stages[currentStage] === "active")
          stages[currentStage] = "complete";
        break;
      case "job.failed":
        if (currentStage) stages[currentStage] = "failed";
        break;
      case "job.cancelled":
        if (currentStage) stages[currentStage] = "cancelled";
        break;
    }

    const progress = measuredProgress(event);

    set({
      status: event.status,
      stages,
      stageLabels,
      currentStage,
      // Keep the last measured value until a stage change; never invent one.
      progressPercent:
        progress ?? (event.stage !== s.currentStage ? null : s.progressPercent),
      message: event.message ?? s.message,
      warnings,
      candidateIds,
      events: [...s.events, event],
      lastTimestamp: event.timestamp,
      lastSeq: typeof event.seq === "number" ? event.seq : s.lastSeq,
      connection: isTerminal(event.status) ? "closed" : s.connection,
    });
    return true;
  },
}));
