import { beforeEach, describe, expect, it } from "vitest";
import { useJobStore, type StageStatus } from "@/stores/jobStore";
import { stationStatuses, type StationStatus } from "@/scene/stations";
import type { JobEvent, JobType } from "@/types";

/**
 * The station mapping (frontend guide FE-1, §12.7). The backend reports stage
 * names such as `validating` and `searching`; the stations are named after job
 * types. These tests feed the real stage sequences through the job store and
 * assert what each station shows.
 */

let seq = 0;

function event(overrides: Partial<JobEvent>): JobEvent {
  seq += 1;
  return {
    job_id: "job_1",
    event: "stage.updated",
    status: "running",
    stage: "validating",
    stage_label: "Validating",
    progress_percent: null,
    candidate_id: null,
    timestamp: `2026-11-19T09:00:${String(seq).padStart(2, "0")}Z`,
    seq,
    ...overrides,
  } as JobEvent;
}

function start(jobId: string, type: JobType) {
  useJobStore.getState().startJob(jobId, type);
}

function station(): Record<string, StationStatus> {
  const s = useJobStore.getState();
  return stationStatuses({
    jobType: s.jobType,
    status: s.status,
    stages: s.stages,
    currentStage: s.currentStage,
  });
}

function idle(): Record<string, StationStatus> {
  return {
    mixing: "idle",
    nutrition: "idle",
    texture_prediction: "idle",
    optimization: "idle",
  };
}

beforeEach(() => {
  seq = 0;
  useJobStore.getState().reset();
});

describe("stationStatuses", () => {
  it("lights nothing before a job exists", () => {
    expect(station()).toEqual(idle());
  });

  it("lights nothing while the job is queued", () => {
    start("job_1", "nutrition");
    expect(station()).toEqual(idle());
  });

  it("lights the vessel during validating, then the nutrition station", () => {
    start("job_1", "nutrition");
    useJobStore.getState().applyEvent(event({ stage: "validating" }));
    expect(station()).toEqual({
      ...idle(),
      mixing: "active",
      nutrition: "active",
    });

    useJobStore.getState().applyEvent(
      event({
        stage: "loading_ingredients",
        stage_label: "Loading ingredients",
      }),
    );
    expect(station().mixing).toBe("complete");
    expect(station().nutrition).toBe("active");
    expect(station().texture_prediction).toBe("idle");
    expect(station().optimization).toBe("idle");
  });

  it("runs a whole nutrition job to complete", () => {
    start("job_1", "nutrition");
    for (const stage of [
      "validating",
      "loading_ingredients",
      "calculating",
      "scoring_amino_acids",
      "storing",
    ]) {
      useJobStore.getState().applyEvent(event({ stage }));
    }
    useJobStore
      .getState()
      .applyEvent(
        event({
          event: "job.completed",
          status: "completed",
          stage: "storing",
        }),
      );
    expect(station()).toEqual({
      mixing: "complete",
      nutrition: "complete",
      texture_prediction: "idle",
      optimization: "idle",
    });
  });

  it("turns the station amber on a warning and still completes", () => {
    start("job_1", "nutrition");
    useJobStore.getState().applyEvent(event({ stage: "validating" }));
    useJobStore
      .getState()
      .applyEvent(event({ stage: "calculating", stage_label: "Calculating" }));
    useJobStore.getState().applyEvent(
      event({
        event: "warning.raised",
        stage: "calculating",
        message: "One ingredient has estimated data.",
      }),
    );
    expect(station().nutrition).toBe("warning");
    useJobStore
      .getState()
      .applyEvent(
        event({
          event: "job.completed",
          status: "completed",
          stage: "calculating",
        }),
      );
    expect(station().nutrition).toBe("complete");
  });

  it("leaves the station red when the job fails in its stage", () => {
    start("job_1", "texture_prediction");
    useJobStore
      .getState()
      .applyEvent(event({ stage: "predicting", stage_label: "Predicting" }));
    useJobStore.getState().applyEvent(
      event({
        event: "job.failed",
        status: "failed",
        stage: "predicting",
        message: "Model unavailable.",
      }),
    );
    const status = station();
    expect(status.texture_prediction).toBe("failed");
    expect(status.nutrition).toBe("idle");
    expect(useJobStore.getState().message).toBe("Model unavailable.");
  });

  it("cancelled jobs mark the station cancelled", () => {
    start("job_1", "optimization");
    useJobStore
      .getState()
      .applyEvent(
        event({ stage: "searching", stage_label: "Searching formulations" }),
      );
    useJobStore.getState().applyEvent(
      event({
        event: "job.cancelled",
        status: "cancelled",
        stage: "searching",
      }),
    );
    expect(station().optimization).toBe("cancelled");
  });

  it("fails in the validating stage, the vessel is the one that failed", () => {
    start("job_1", "optimization");
    useJobStore.getState().applyEvent(event({ stage: "validating" }));
    useJobStore.getState().applyEvent(
      event({
        event: "job.failed",
        status: "failed",
        stage: "validating",
      }),
    );
    expect(station().mixing).toBe("failed");
    expect(station().optimization).toBe("failed");
  });

  it("ignores a stage status from a different job type's history", () => {
    start("job_1", "nutrition");
    useJobStore.getState().applyEvent(event({ stage: "validating" }));
    // A late event for a stage the store has never seen for this job type.
    useJobStore
      .getState()
      .applyEvent(event({ stage: "searching", stage_label: "Searching" }));
    expect(station().nutrition).toBe("active");
    expect(station().optimization).toBe("idle");
  });

  it("stage statuses are the store's, not invented", () => {
    start("job_1", "nutrition");
    useJobStore.getState().applyEvent(event({ stage: "validating" }));
    const raw: Record<string, StageStatus> = useJobStore.getState().stages;
    expect(raw.validating).toBe("active");
    // The station name is a job type, so it is absent from the raw stage map.
    expect(raw.nutrition).toBeUndefined();
  });
});
