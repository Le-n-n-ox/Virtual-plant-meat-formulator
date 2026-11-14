import type { JobRecord } from "@/types";

/** Mock job history. Statuses and durations are synthetic. */

export const MOCK_JOBS: JobRecord[] = [
  {
    id: "mock-job-1",
    type: "nutrition",
    status: "completed",
    formulation_id: "mock-formulation-1",
    stage: "nutrition",
    stage_label: "Calculating nutrients",
    progress_percent: 100,
    message: null,
    candidate_ids: [],
    started_at: "2026-11-14T09:00:30Z",
    finished_at: "2026-11-14T09:00:32Z",
    duration_ms: 1200,
  },
  {
    id: "mock-job-2",
    type: "optimization",
    status: "completed",
    formulation_id: "mock-formulation-1",
    stage: "optimization",
    stage_label: "Searching formulations",
    progress_percent: 100,
    message: null,
    candidate_ids: ["mock-candidate-1", "mock-candidate-2", "mock-candidate-3"],
    started_at: "2026-11-14T09:08:00Z",
    finished_at: "2026-11-14T09:08:06Z",
    duration_ms: 6000,
  },
  {
    id: "mock-job-3",
    type: "texture_prediction",
    status: "failed",
    formulation_id: "mock-formulation-2",
    stage: "texture_prediction",
    stage_label: "Predicting texture",
    progress_percent: null,
    message: "Mock failure: input is outside the mock training range.",
    candidate_ids: [],
    started_at: "2026-11-13T15:00:00Z",
    finished_at: "2026-11-13T15:00:02Z",
    duration_ms: 2000,
  },
  {
    id: "mock-job-4",
    type: "nutrition",
    status: "running",
    formulation_id: "mock-formulation-3",
    stage: "mixing",
    stage_label: "Preparing formulation",
    progress_percent: 40,
    message: null,
    candidate_ids: [],
    started_at: "2026-11-14T10:00:00Z",
    finished_at: null,
    duration_ms: null,
  },
];

export const MOCK_JOBS_BY_ID: Record<string, JobRecord> = Object.fromEntries(
  MOCK_JOBS.map((job) => [job.id, job]),
);
