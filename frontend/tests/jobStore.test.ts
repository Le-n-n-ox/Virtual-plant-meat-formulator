import { beforeEach, describe, expect, it } from "vitest";
import { useJobStore } from "@/stores/jobStore";
import type { JobEvent } from "@/types";

const JOB = "job_1";
let seq = 0;

function ev(partial: Partial<JobEvent>): JobEvent {
  seq += 1;
  return {
    job_id: JOB,
    event: "stage.updated",
    status: "running",
    stage: "mixing",
    stage_label: "Preparing formulation",
    progress_percent: null,
    candidate_id: null,
    timestamp: new Date(Date.UTC(2026, 10, 14, 0, 0, seq)).toISOString(),
    seq,
    ...partial,
  };
}

const apply = (e: JobEvent) => useJobStore.getState().applyEvent(e);
const state = () => useJobStore.getState();

describe("jobStore.applyEvent", () => {
  beforeEach(() => {
    seq = 0;
    useJobStore.getState().reset();
    useJobStore.getState().startJob(JOB, "optimization");
  });

  it("ignores events for another job", () => {
    expect(apply(ev({ job_id: "other" }))).toBe(false);
    expect(state().events).toHaveLength(0);
  });

  it("marks the previous stage complete when the worker moves on", () => {
    apply(ev({ stage: "mixing" }));
    apply(ev({ stage: "optimization", stage_label: "Searching" }));
    expect(state().stages).toEqual({
      mixing: "complete",
      optimization: "active",
    });
    expect(state().stageLabels.optimization).toBe("Searching");
  });

  it("keeps progress null unless the worker reports a measurable value", () => {
    apply(ev({ stage: "texture_prediction" }));
    expect(state().progressPercent).toBeNull();
    apply(
      ev({
        event: "progress.updated",
        stage: "texture_prediction",
        completed: 3,
        total: 12,
      }),
    );
    expect(state().progressPercent).toBe(25);
    apply(
      ev({
        event: "progress.updated",
        stage: "texture_prediction",
        progress_percent: 40,
      }),
    );
    expect(state().progressPercent).toBe(40);
  });

  it("drops duplicate and out-of-order events by seq", () => {
    const a = ev({ stage: "mixing" });
    const b = ev({ stage: "nutrition" });
    expect(apply(b)).toBe(true);
    expect(apply(a)).toBe(false);
    expect(apply(b)).toBe(false);
    expect(state().currentStage).toBe("nutrition");
  });

  it("falls back to timestamps when seq is absent", () => {
    apply(
      ev({
        seq: undefined,
        stage: "nutrition",
        timestamp: "2026-11-14T00:00:10Z",
      }),
    );
    expect(
      apply(
        ev({
          seq: undefined,
          stage: "mixing",
          timestamp: "2026-11-14T00:00:05Z",
        }),
      ),
    ).toBe(false);
  });

  it("never lets a late event overwrite a terminal state", () => {
    apply(ev({ stage: "optimization" }));
    apply(
      ev({
        event: "job.failed",
        status: "failed",
        stage: "optimization",
        message: "Infeasible",
      }),
    );
    expect(state().status).toBe("failed");
    expect(state().stages.optimization).toBe("failed");
    expect(state().connection).toBe("closed");
    expect(apply(ev({ stage: "optimization", status: "running" }))).toBe(false);
    expect(state().status).toBe("failed");
  });

  it("records warnings and candidates without duplicates", () => {
    apply(ev({ stage: "optimization" }));
    apply(
      ev({
        event: "warning.raised",
        stage: "optimization",
        message: "Out of range",
      }),
    );
    apply(
      ev({
        event: "candidate.ready",
        stage: "optimization",
        candidate_id: "c1",
      }),
    );
    apply(
      ev({
        event: "candidate.ready",
        stage: "optimization",
        candidate_id: "c1",
      }),
    );
    expect(state().stages.optimization).toBe("warning");
    expect(state().warnings.map((w) => w.message)).toEqual(["Out of range"]);
    expect(state().candidateIds).toEqual(["c1"]);
  });

  it("completes the active stage on job.completed and keeps warning stages", () => {
    apply(ev({ stage: "mixing" }));
    apply(ev({ stage: "nutrition" }));
    apply(
      ev({ event: "job.completed", status: "completed", stage: "nutrition" }),
    );
    expect(state().stages).toEqual({
      mixing: "complete",
      nutrition: "complete",
    });
  });
});
