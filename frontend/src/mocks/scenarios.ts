import { useJobStore } from "@/stores/jobStore";
import type { JobEvent, JobType } from "@/types";

/**
 * DEV-ONLY scripted job scenarios (frontend guide §8). The timers below only
 * pace the *mock server*; the UI still derives every stage and percentage from
 * the event contents, exactly as it will with the real SSE stream.
 */
export type ScenarioId =
  | "nutrition"
  | "texture"
  | "optimization"
  | "warning"
  | "failure"
  | "cancelled";

export const SCENARIOS: { id: ScenarioId; label: string; type: JobType }[] = [
  { id: "nutrition", label: "Nutrition job", type: "nutrition" },
  {
    id: "texture",
    label: "Texture (indeterminate)",
    type: "texture_prediction",
  },
  {
    id: "optimization",
    label: "Optimization + 3 candidates",
    type: "optimization",
  },
  { id: "warning", label: "Job with warning", type: "texture_prediction" },
  { id: "failure", label: "Job that fails", type: "optimization" },
  { id: "cancelled", label: "Job that is cancelled", type: "nutrition" },
];

type Step = {
  after: number;
  event: Omit<JobEvent, "job_id" | "timestamp" | "seq">;
};

const base = { candidate_id: null, progress_percent: null } as const;

const mix: Step = {
  after: 300,
  event: {
    ...base,
    event: "stage.updated",
    status: "running",
    stage: "mixing",
    stage_label: "Preparing formulation",
  },
};

function script(id: ScenarioId): Step[] {
  switch (id) {
    case "nutrition":
      return [
        mix,
        {
          after: 1200,
          event: {
            ...base,
            event: "stage.updated",
            status: "running",
            stage: "nutrition",
            stage_label: "Calculating nutrients",
          },
        },
        {
          after: 1800,
          event: {
            ...base,
            event: "result.ready",
            status: "running",
            stage: "nutrition",
            stage_label: "Calculating nutrients",
            message: "Nutrition result stored",
          },
        },
        {
          after: 300,
          event: {
            ...base,
            event: "job.completed",
            status: "completed",
            stage: "nutrition",
            stage_label: "Calculating nutrients",
          },
        },
      ];
    case "texture":
      return [
        mix,
        {
          after: 1000,
          event: {
            ...base,
            event: "stage.updated",
            status: "running",
            stage: "texture_prediction",
            stage_label: "Predicting texture",
            message: "Evaluating the selected formulation",
          },
        },
        {
          after: 3500,
          event: {
            ...base,
            event: "result.ready",
            status: "running",
            stage: "texture_prediction",
            stage_label: "Predicting texture",
          },
        },
        {
          after: 300,
          event: {
            ...base,
            event: "job.completed",
            status: "completed",
            stage: "texture_prediction",
            stage_label: "Predicting texture",
          },
        },
      ];
    case "optimization": {
      const steps: Step[] = [
        mix,
        {
          after: 900,
          event: {
            ...base,
            event: "stage.updated",
            status: "running",
            stage: "optimization",
            stage_label: "Searching formulations",
            progress_percent: 0,
            completed: 0,
            total: 30,
          },
        },
      ];
      for (let i = 1; i <= 30; i++) {
        steps.push({
          after: 180,
          event: {
            ...base,
            event: "progress.updated",
            status: "running",
            stage: "optimization",
            stage_label: "Searching formulations",
            progress_percent: null,
            completed: i,
            total: 30,
          },
        });
        if (i % 10 === 0) {
          steps.push({
            after: 60,
            event: {
              ...base,
              event: "candidate.ready",
              status: "running",
              stage: "optimization",
              stage_label: "Searching formulations",
              candidate_id: `demo-candidate-${i / 10}`,
            },
          });
        }
      }
      steps.push({
        after: 300,
        event: {
          ...base,
          event: "job.completed",
          status: "completed",
          stage: "optimization",
          stage_label: "Searching formulations",
        },
      });
      return steps;
    }
    case "warning":
      return [
        mix,
        {
          after: 1000,
          event: {
            ...base,
            event: "stage.updated",
            status: "running",
            stage: "texture_prediction",
            stage_label: "Predicting texture",
          },
        },
        {
          after: 1500,
          event: {
            ...base,
            event: "warning.raised",
            status: "running",
            stage: "texture_prediction",
            stage_label: "Predicting texture",
            message:
              "Input is outside the model's training range for moisture.",
          },
        },
        {
          after: 1500,
          event: {
            ...base,
            event: "result.ready",
            status: "running",
            stage: "texture_prediction",
            stage_label: "Predicting texture",
          },
        },
        {
          after: 300,
          event: {
            ...base,
            event: "job.completed",
            status: "completed",
            stage: "texture_prediction",
            stage_label: "Predicting texture",
          },
        },
      ];
    case "failure":
      return [
        mix,
        {
          after: 900,
          event: {
            ...base,
            event: "stage.updated",
            status: "running",
            stage: "optimization",
            stage_label: "Searching formulations",
            completed: 0,
            total: 30,
          },
        },
        {
          after: 1500,
          event: {
            ...base,
            event: "progress.updated",
            status: "running",
            stage: "optimization",
            stage_label: "Searching formulations",
            completed: 7,
            total: 30,
          },
        },
        {
          after: 1200,
          event: {
            ...base,
            event: "job.failed",
            status: "failed",
            stage: "optimization",
            stage_label: "Searching formulations",
            message:
              "Constraints are infeasible: protein minimum cannot be met with current bounds.",
          },
        },
      ];
    case "cancelled":
      return [
        mix,
        {
          after: 1200,
          event: {
            ...base,
            event: "stage.updated",
            status: "running",
            stage: "nutrition",
            stage_label: "Calculating nutrients",
          },
        },
        {
          after: 1500,
          event: {
            ...base,
            event: "job.cancelled",
            status: "cancelled",
            stage: "nutrition",
            stage_label: "Calculating nutrients",
            message: "Cancelled by user.",
          },
        },
      ];
  }
}

/** Replays a scenario into the job store. Returns a function that stops it. */
export function playScenario(id: ScenarioId): () => void {
  const scenario = SCENARIOS.find((s) => s.id === id)!;
  const jobId = `mock_${id}_${Date.now().toString(36)}`;
  const store = useJobStore.getState();
  store.startJob(jobId, scenario.type);
  store.setConnection("open");

  const timers: ReturnType<typeof setTimeout>[] = [];
  let at = 0;
  script(id).forEach((step, index) => {
    at += step.after;
    timers.push(
      setTimeout(() => {
        useJobStore.getState().applyEvent({
          ...step.event,
          job_id: jobId,
          seq: index + 1,
          timestamp: new Date().toISOString(),
        });
      }, at),
    );
  });
  return () => timers.forEach(clearTimeout);
}
