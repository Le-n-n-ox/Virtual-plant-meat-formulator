import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import cancelled from "./fixtures/sse/cancelled.json";
import failed from "./fixtures/sse/failed.json";
import nutrition from "./fixtures/sse/nutrition.json";
import outOfOrder from "./fixtures/sse/out-of-order.json";
import optimization from "./fixtures/sse/optimization.json";
import reconnect from "./fixtures/sse/reconnect.json";
import textureIndeterminate from "./fixtures/sse/texture-indeterminate.json";
import warning from "./fixtures/sse/warning.json";
import { openJobEventStream } from "@/lib/sse/jobEventSource";
import { useJobStore } from "@/stores/jobStore";
import type { JobEvent, JobStatusResponse, JobType } from "@/types";

/**
 * The seven scripted job-stream scenarios from frontend guide §8 / FE-5. The
 * real stage names come from the backend guide §7.
 */

/** JSON imports are typed literally; every fixture follows the backend contract. */
function fixture(events: unknown): JobEvent[] {
  return events as JobEvent[];
}

const scripts: Record<string, JobEvent[]> = {
  nutrition: fixture(nutrition),
  "texture-indeterminate": fixture(textureIndeterminate),
  optimization: fixture(optimization),
  warning: fixture(warning),
  failed: fixture(failed),
  cancelled: fixture(cancelled),
  "out-of-order": fixture(outOfOrder),
  reconnect: fixture(reconnect),
};

function load(name: string): JobEvent[] {
  const script = scripts[name];
  if (!script) throw new Error(`unknown fixture: ${name}`);
  return script;
}

type Listener = (event: MessageEvent) => void;

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  url: string;
  private listeners = new Map<string, Listener[]>();
  onopen: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  closed = false;

  constructor(url: string) {
    this.url = url;
    FakeEventSource.instances.push(this);
  }

  addEventListener(name: string, listener: Listener) {
    this.listeners.set(name, [...(this.listeners.get(name) ?? []), listener]);
  }

  close() {
    this.closed = true;
  }

  /** Deliver one scripted event to the client, as the SSE server would. */
  emit(event: JobEvent) {
    for (const listener of this.listeners.get(event.event) ?? []) {
      listener({ data: JSON.stringify(event) } as MessageEvent);
    }
  }

  /** Deliver a raw, possibly malformed payload under an event name. */
  emitRaw(name: string, raw: string) {
    for (const listener of this.listeners.get(name) ?? []) {
      listener({ data: raw } as MessageEvent);
    }
  }

  drop(error: unknown) {
    this.onerror?.(error);
  }
}

function jsonResponse(body: unknown): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    text: async () => JSON.stringify(body),
    json: async () => body,
  } as Response;
}

function jobStatus(
  overrides: Partial<JobStatusResponse> = {},
): JobStatusResponse {
  return {
    id: "job_1",
    type: "nutrition",
    status: "running",
    stage: "calculating",
    stage_label: "Calculating nutrition",
    progress_percent: null,
    message: null,
    cancel_requested: false,
    formulation_id: "frm_1",
    formulation_version: 1,
    error: null,
    candidate_ids: [],
    result_available: false,
    last_event_seq: 0,
    created_at: "2026-11-19T09:00:00Z",
    started_at: null,
    finished_at: null,
    data_versions: {},
    model_ids: [],
    calc_version: null,
    seed: null,
    ...overrides,
  };
}

/** Stubs the two REST calls the stream client makes. */
function stubFetch(status: JobStatusResponse = jobStatus()) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const url = String(input);
    if (url.includes("/stream-token")) {
      return jsonResponse({
        token: "test-token",
        expires_at: "2026-11-19T10:00:00Z",
      });
    }
    if (url.includes("/api/jobs/")) {
      return jsonResponse(status);
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
}

async function flush() {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function start(type: JobType = "nutrition") {
  useJobStore.getState().startJob("job_1", type);
}

function open() {
  const received: JobEvent[] = [];
  const errors: unknown[] = [];
  const stream = openJobEventStream("job_1", {
    onEvent: (event) => {
      received.push(event);
      useJobStore.getState().applyEvent(event);
    },
    onError: (error) => errors.push(error),
  });
  return { stream, received, errors };
}

function lastSource() {
  const source = FakeEventSource.instances.at(-1);
  if (!source) throw new Error("no EventSource was opened");
  return source;
}

beforeEach(() => {
  FakeEventSource.instances = [];
  useJobStore.getState().reset();
  vi.stubGlobal("EventSource", FakeEventSource);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("scripted job streams", () => {
  it("scenario 1: a nutrition job completes its stages in order and closes", async () => {
    stubFetch();
    start("nutrition");
    const { stream, received } = open();
    await flush();

    const source = lastSource();
    for (const event of load("nutrition")) source.emit(event);

    expect(received).toHaveLength(6);
    const stages = useJobStore.getState().stages;
    expect(stages.validating).toBe("complete");
    expect(stages.loading_ingredients).toBe("complete");
    expect(stages.calculating).toBe("complete");
    expect(stages.scoring_amino_acids).toBe("complete");
    expect(useJobStore.getState().status).toBe("completed");
    expect(source.closed).toBe(true);
    stream.close();
  });

  it("scenario 2: indeterminate texture progress never becomes a number", async () => {
    stubFetch();
    start("texture_prediction");
    const { stream, received } = open();
    await flush();

    const source = lastSource();
    for (const event of load("texture-indeterminate")) source.emit(event);

    expect(received.length).toBeGreaterThan(0);
    expect(useJobStore.getState().progressPercent).toBeNull();
    expect(useJobStore.getState().status).toBe("completed");
    stream.close();
  });

  it("scenario 3: optimization progress comes only from events, candidates in order", async () => {
    stubFetch();
    start("optimization");
    const { stream } = open();
    await flush();

    const source = lastSource();
    const observed: (number | null)[] = [];
    const tracker = useJobStore.subscribe((state) =>
      observed.push(state.progressPercent),
    );
    for (const event of load("optimization")) source.emit(event);
    tracker();

    const state = useJobStore.getState();
    expect(state.candidateIds).toEqual(["cand_a", "cand_b", "cand_c"]);
    // completed/total on searching: 0/4, 2/4, 4/4 -> 0, 50, 100, and nothing else.
    const distinct = [...new Set(observed.filter((value) => value !== null))];
    expect(distinct).toEqual([0, 50, 100]);
    expect(state.stages.validating).toBe("complete");
    expect(state.stages.searching).toBe("complete");
    // The final stage (ranking) is indeterminate, so no percentage is invented.
    expect(state.progressPercent).toBeNull();
    stream.close();
  });

  it("scenario 4: a warning is stored with its stage and message, and the job still completes", async () => {
    stubFetch();
    start("nutrition");
    const { stream } = open();
    await flush();

    const source = lastSource();
    for (const event of load("warning")) source.emit(event);

    const state = useJobStore.getState();
    expect(state.warnings).toEqual([
      {
        stage: "calculating",
        message: "One ingredient has estimated data.",
        timestamp: "2026-11-19T09:03:02Z",
      },
    ]);
    expect(state.stages.calculating).toBe("warning");
    expect(state.status).toBe("completed");
    stream.close();
  });

  it("scenario 5a: a failed job stores the error and ignores anything after it", async () => {
    stubFetch();
    start("nutrition");
    const { stream } = open();
    await flush();

    const source = lastSource();
    const script = load("failed");
    for (const event of script) source.emit(event);
    const afterTerminal = useJobStore.getState().events.length;
    // A late event after the terminal one must not be applied.
    source.emit({
      ...script[0],
      seq: 99,
      event: "stage.updated",
      stage: "storing",
      timestamp: "2026-11-19T09:04:10Z",
    });

    const state = useJobStore.getState();
    expect(state.status).toBe("failed");
    expect(state.message).toBe("Ingredient data is missing.");
    expect(state.events).toHaveLength(afterTerminal);
    stream.close();
  });

  it("scenario 5b: a cancelled job stores the cancelled status", async () => {
    stubFetch();
    start("optimization");
    const { stream } = open();
    await flush();

    const source = lastSource();
    for (const event of load("cancelled")) source.emit(event);

    expect(useJobStore.getState().status).toBe("cancelled");
    stream.close();
  });

  it("scenario 6: a dropped connection reconnects from the last seq with a new token", async () => {
    vi.useFakeTimers();
    // The status call says two more events exist than the client has seen.
    const fetchMock = stubFetch(jobStatus({ last_event_seq: 3 }));
    start("nutrition");
    const { stream } = open();
    await vi.advanceTimersByTimeAsync(0);

    const first = lastSource();
    first.emit(load("reconnect")[0]);
    first.emit(load("reconnect")[1]);
    expect(useJobStore.getState().lastSeq).toBe(2);

    // The socket drops; the client reads the job, then reconnects.
    first.drop(new Event("error"));
    await vi.advanceTimersByTimeAsync(0); // the status call
    await vi.advanceTimersByTimeAsync(600); // the reconnect backoff

    // token, status, token
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const second = lastSource();
    expect(second).not.toBe(first);
    expect(second.closed).toBe(false);
    expect(second.url).toContain("after_seq=2");
    stream.close();
  });

  it("scenario 7: out-of-order and duplicate events are ignored", async () => {
    stubFetch();
    start("nutrition");
    const { stream, received } = open();
    await flush();

    const source = lastSource();
    for (const event of load("out-of-order")) source.emit(event);

    // seq 1, 3 and 4 are applied; seq 2 arrives too late and seq 3 is a duplicate.
    expect(received.map((e) => e.seq)).toEqual([1, 3, 4]);
    const stages = useJobStore.getState().stages;
    expect(stages.validating).toBe("complete");
    expect(stages.calculating).toBe("complete");
    expect(stages.loading_ingredients).toBeUndefined();
    expect(useJobStore.getState().status).toBe("completed");
    stream.close();
  });

  it("drops a malformed event instead of applying it", async () => {
    stubFetch();
    start("nutrition");
    const { stream, received, errors } = open();
    await flush();

    const source = lastSource();
    source.emitRaw("stage.updated", JSON.stringify({ job_id: "job_1" }));
    source.emit(load("nutrition")[0]);

    expect(received).toHaveLength(1);
    expect(errors).toHaveLength(1);
    stream.close();
  });
});
