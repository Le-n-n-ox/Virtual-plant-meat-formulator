import { ApiError } from "@/lib/api/client";
import {
  getJob,
  getJobResult,
  startJob,
  type StartJobBody,
} from "@/lib/api/jobs";
import { getNutrition } from "@/lib/api/results";
import {
  openJobEventStream,
  type JobEventStream,
} from "@/lib/sse/jobEventSource";
import { isTerminal, useJobStore } from "@/stores/jobStore";
import { useResultStore } from "@/stores/resultStore";
import type { JobEvent, JobType, TextureResult } from "@/types";

let stream: JobEventStream | null = null;

export function stopJobStream(): void {
  stream?.close();
  stream = null;
}

const ERROR_TEXT: Record<string, string> = {
  model_unavailable:
    "No approved texture model yet — an admin must approve one on the Models page.",
  missing_ingredient_data:
    "Some ingredients are missing the data this calculation needs.",
  job_limit_reached: "Too many jobs are running. Try again shortly.",
};

export function describeRunError(code: string, message: string): string {
  return ERROR_TEXT[code] ?? message;
}

async function finishJob(
  jobId: string,
  event: JobEvent,
  formulationId: string,
  version: number,
  type: StartJobBody["type"],
): Promise<void> {
  const results = useResultStore.getState();
  const current = () => useJobStore.getState().activeJobId === jobId;
  if (event.event === "job.completed") {
    results.setLoading(true);
    try {
      if (type === "nutrition") {
        const nutrition = await getNutrition(formulationId, version);
        if (current()) results.setNutrition(nutrition, version, jobId);
      } else if (type === "texture_prediction") {
        const raw = await getJobResult<{
          payload?: TextureResult & { evidence_basis?: string };
        }>(jobId);
        const payload = raw.payload ?? (raw as unknown as TextureResult);
        if (current()) results.setTexture(payload, version, jobId);
      } else if (current()) {
        results.setLoading(false);
      }
    } catch (error) {
      if (current()) {
        results.setError({
          code: error instanceof ApiError ? error.code : "request_failed",
          message:
            error instanceof Error ? error.message : "Could not load results.",
          jobType: type,
        });
      }
    }
  } else if (event.event === "job.failed") {
    let code = "job_failed";
    let message = event.message ?? "The job failed.";
    try {
      const status = await getJob(jobId);
      code = status.error?.code ?? code;
      message = status.error?.message ?? message;
    } catch {
      /* fall back to the event message */
    }
    if (current()) results.setError({ code, message, jobType: type });
  }
}

/**
 * Opens the event stream for a job and feeds real events into the job store.
 * Shared by `runJob` (a job we just created) and `reattachToJob` (one that was
 * already running when the page loaded).
 */
function attachStream(
  jobId: string,
  formulationId: string,
  version: number,
  type: StartJobBody["type"],
): void {
  stream = openJobEventStream(jobId, {
    onOpen: () => {
      if (useJobStore.getState().connection !== "closed")
        useJobStore.getState().setConnection("open");
    },
    onError: () => {
      if (useJobStore.getState().connection !== "closed")
        useJobStore.getState().setConnection("reconnecting");
    },
    onEvent: (event) => {
      const applied = useJobStore.getState().applyEvent(event);
      if (
        applied &&
        (event.event === "job.completed" ||
          event.event === "job.failed" ||
          event.event === "job.cancelled")
      ) {
        void finishJob(jobId, event, formulationId, version, type);
      }
    },
  });
}

/**
 * Starts a job for the saved formulation version and feeds the real SSE events
 * into the job store (which drives the timeline and 3D scene). Throws ApiError
 * if the job could not be created.
 */
export async function runJob(
  formulationId: string,
  version: number,
  body: StartJobBody,
): Promise<void> {
  stopJobStream();
  const results = useResultStore.getState();
  results.setError(null);
  results.setLoading(false);
  const created = await startJob(formulationId, { ...body, version });
  const jobs = useJobStore.getState();
  jobs.startJob(created.job_id, body.type);
  attachStream(created.job_id, formulationId, version, body.type);
}

/**
 * Resumes a job that is already queued or running for this formulation — one
 * started in another tab, or before a reload. The store is rebuilt from
 * `GET /api/jobs/{id}` instead of being reset, then the stream is reattached so
 * the timeline and scene continue from where the job actually is.
 *
 * Returns false when the job could not be read (it may have finished between the
 * list and the fetch), in which case the caller leaves the store alone.
 */
export async function reattachToJob(jobId: string): Promise<boolean> {
  stopJobStream();
  let job: Awaited<ReturnType<typeof getJob>>;
  try {
    job = await getJob(jobId);
  } catch {
    return false;
  }

  useJobStore.getState().hydrate({
    id: job.id,
    type: job.type as JobType,
    status: job.status,
    stage: job.stage,
    stageLabel: job.stage_label,
    progressPercent: job.progress_percent,
    message: job.message,
    candidateIds: job.candidate_ids,
    lastSeq: job.last_event_seq,
  });

  if (isTerminal(job.status)) {
    useJobStore.getState().setConnection("closed");
    return true;
  }
  attachStream(
    job.id,
    job.formulation_id,
    job.formulation_version,
    job.type as StartJobBody["type"],
  );
  return true;
}
