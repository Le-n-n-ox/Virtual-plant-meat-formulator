import { API_BASE_URL } from "@/lib/api/client";
import { getJob, getStreamToken } from "@/lib/api/jobs";
import { jobEventSchema } from "@/lib/validation/schemas";
import type { JobEvent, JobEventName } from "@/types";

export const JOB_EVENT_NAMES: JobEventName[] = [
  "stage.updated",
  "progress.updated",
  "warning.raised",
  "candidate.ready",
  "result.ready",
  "job.completed",
  "job.failed",
  "job.cancelled",
];

const TERMINAL: JobEventName[] = [
  "job.completed",
  "job.failed",
  "job.cancelled",
];
const TERMINAL_STATUSES = ["completed", "failed", "cancelled"];

export interface JobEventStreamOptions {
  onEvent: (event: JobEvent) => void;
  onError?: (error: unknown) => void;
  onOpen?: () => void;
  /** Highest seq already processed; events at or below it are ignored. */
  lastSeq?: number;
}

export interface JobEventStream {
  close: () => void;
}

const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 15_000;

export function openJobEventStream(
  jobId: string,
  options: JobEventStreamOptions,
): JobEventStream {
  let lastSeq = options.lastSeq ?? 0;
  let closed = false;
  let source: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let attempts = 0;

  const teardown = () => {
    source?.close();
    source = null;
    if (timer) clearTimeout(timer);
    timer = null;
  };

  const finish = () => {
    closed = true;
    teardown();
  };

  const handleMessage = (message: MessageEvent) => {
    if (closed) return;
    let event: JobEvent;
    try {
      event = JSON.parse(message.data as string) as JobEvent;
    } catch (error) {
      options.onError?.(error);
      return;
    }
    // Never apply an event the backend would not have sent; a malformed one is
    // dropped and reported rather than corrupting the job state.
    const parsed = jobEventSchema.safeParse(event);
    if (!parsed.success) {
      options.onError?.(parsed.error);
      return;
    }
    event = parsed.data as JobEvent;
    if (typeof event.seq === "number") {
      if (event.seq <= lastSeq) return; // stale or duplicate
      lastSeq = event.seq;
    }
    attempts = 0;
    options.onEvent(event);
    if (TERMINAL.includes(event.event)) finish();
  };

  const scheduleReconnect = () => {
    const delay = Math.min(MAX_DELAY_MS, BASE_DELAY_MS * 2 ** attempts);
    attempts += 1;
    timer = setTimeout(() => void connect(), delay);
  };

  const handleError = async (error: unknown) => {
    teardown();
    if (closed) return;
    options.onError?.(error);
    try {
      const status = await getJob(jobId);
      if (closed) return;
      if (TERMINAL_STATUSES.includes(status.status)) {
        // Replay anything missed once, then stop; the authoritative state is terminal.
        if (status.last_event_seq > lastSeq) {
          scheduleReconnect();
          return;
        }
        finish();
        return;
      }
    } catch (statusError) {
      if (closed) return;
      options.onError?.(statusError);
    }
    scheduleReconnect();
  };

  const connect = async () => {
    if (closed) return;
    try {
      const { token } = await getStreamToken(jobId);
      if (closed) return;
      const url =
        `${API_BASE_URL}/api/jobs/${encodeURIComponent(jobId)}/events` +
        `?token=${encodeURIComponent(token)}&after_seq=${lastSeq}`;
      const es = new EventSource(url);
      source = es;
      es.onopen = () => options.onOpen?.();
      for (const name of JOB_EVENT_NAMES) {
        es.addEventListener(name, (e) => handleMessage(e as MessageEvent));
      }
      es.onerror = (e) => void handleError(e);
    } catch (error) {
      await handleError(error);
    }
  };

  void connect();

  return { close: finish };
}
