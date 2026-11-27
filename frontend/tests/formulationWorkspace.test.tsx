import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Formulation workspace behaviour (guide §5 page 6): the unsaved-changes guard,
 * and resuming a job that is still running after a reload.
 */

const getJob = vi.fn();
const openJobEventStream = vi.fn();

vi.mock("@/lib/api/jobs", () => ({
  getJob: (id: string) => getJob(id),
  startJob: vi.fn(),
  getJobResult: vi.fn(),
}));
vi.mock("@/lib/sse/jobEventSource", () => ({
  openJobEventStream: (...args: unknown[]) => openJobEventStream(...args),
}));
vi.mock("@/lib/api/results", () => ({ getNutrition: vi.fn() }));
vi.mock("@/hooks/use-api-query", () => ({
  useApiQuery: () => ({
    data: [
      { key: "lysine", name: "Lysine", kind: "amino_acid", unit: "mg" },
      { key: "protein", name: "Protein", kind: "macronutrient", unit: "g" },
    ],
    error: null,
    loading: false,
    reload: vi.fn(),
  }),
}));

import { TargetsPanel } from "@/components/formulation/targets-panel";
import { useUnsavedChangesGuard } from "@/lib/unsaved-changes";
import { reattachToJob, stopJobStream } from "@/lib/jobs/job-runner";
import { isTerminal, useJobStore } from "@/stores/jobStore";

beforeEach(() => {
  window.history.pushState({}, "", "/");
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  stopJobStream();
  useJobStore.getState().reset();
});

function Probe({ enabled }: { enabled: boolean }) {
  useUnsavedChangesGuard(enabled, "Leave anyway?");
  return (
    <button
      type="button"
      onClick={() => window.history.pushState({}, "", "/next")}
    >
      navigate
    </button>
  );
}

describe("useUnsavedChangesGuard", () => {
  it("arms beforeunload while there are unsaved changes", () => {
    render(<Probe enabled />);
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });

  it("does not arm beforeunload when the draft is clean", () => {
    render(<Probe enabled={false} />);
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(false);
  });

  it("blocks in-app navigation until the user confirms", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<Probe enabled />);

    fireEvent.click(screen.getByText("navigate"));
    expect(window.location.pathname).toBe("/");
    expect(window.confirm).toHaveBeenCalledWith("Leave anyway?");
  });

  it("lets in-app navigation through once confirmed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<Probe enabled />);

    fireEvent.click(screen.getByText("navigate"));
    expect(window.location.pathname).toBe("/next");
  });

  it("restores the history methods on unmount", () => {
    const { unmount } = render(<Probe enabled />);
    unmount();
    // Back to the real implementation: navigation works without a prompt.
    window.history.pushState({}, "", "/plain");
    expect(window.location.pathname).toBe("/plain");
  });
});

const jobStatus = (over: Record<string, unknown> = {}) => ({
  id: "job_1",
  type: "optimization",
  status: "running",
  stage: "search",
  stage_label: "Searching",
  progress_percent: 42,
  message: "working",
  cancel_requested: false,
  formulation_id: "frm_1",
  formulation_version: 3,
  error: null,
  candidate_ids: ["cand_1"],
  result_available: false,
  last_event_seq: 7,
  created_at: "2026-01-01T00:00:00Z",
  started_at: "2026-01-01T00:00:01Z",
  finished_at: null,
  data_versions: {},
  ...over,
});

describe("jobStore.hydrate", () => {
  it("rebuilds the running job instead of leaving the store idle", () => {
    useJobStore.getState().hydrate({
      id: "job_1",
      type: "optimization",
      status: "running",
      stage: "search",
      stageLabel: "Searching",
      progressPercent: 42,
      message: "working",
      candidateIds: ["cand_1"],
      lastSeq: 7,
    });

    const s = useJobStore.getState();
    expect(s.activeJobId).toBe("job_1");
    expect(s.status).toBe("running");
    expect(s.currentStage).toBe("search");
    expect(s.stageLabels.search).toBe("Searching");
    expect(s.progressPercent).toBe(42);
    expect(s.candidateIds).toEqual(["cand_1"]);
    expect(s.lastSeq).toBe(7);
    expect(s.connection).toBe("connecting");
  });

  it("drops replayed events that were already applied before the reload", () => {
    useJobStore.getState().hydrate({
      id: "job_1",
      type: "optimization",
      status: "running",
      stage: "search",
      stageLabel: "Searching",
      progressPercent: 42,
      message: "working",
      candidateIds: [],
      lastSeq: 7,
    });
    const replayed = {
      job_id: "job_1",
      event: "progress.updated" as const,
      status: "running" as const,
      stage: "search",
      stage_label: "Searching",
      progress_percent: null,
      candidate_id: null,
      timestamp: "2026-01-01T00:00:02Z",
      seq: 7,
    };
    expect(useJobStore.getState().applyEvent(replayed)).toBe(false);
  });
});

describe("reattachToJob", () => {
  it("reads the job, rehydrates the store and reopens the stream", async () => {
    getJob.mockResolvedValue(jobStatus());
    openJobEventStream.mockReturnValue({ close: vi.fn() });

    await expect(reattachToJob("job_1")).resolves.toBe(true);

    expect(getJob).toHaveBeenCalledWith("job_1");
    expect(openJobEventStream).toHaveBeenCalledTimes(1);
    const [streamId, handlers] = openJobEventStream.mock.calls[0] as [
      string,
      { onEvent: (event: unknown) => void },
    ];
    expect(streamId).toBe("job_1");
    expect(typeof handlers.onEvent).toBe("function");

    // Events arriving on the reattached stream reach the store.
    handlers.onEvent({
      job_id: "job_1",
      event: "progress",
      status: "running",
      stage: "search",
      stage_label: "Searching",
      progress_percent: 60,
      candidate_id: null,
      timestamp: "2026-01-01T00:00:03Z",
      seq: 8,
    });
    expect(useJobStore.getState().progressPercent).toBe(60);
  });

  it("does not reopen the stream for a job that has finished", async () => {
    getJob.mockResolvedValue(
      jobStatus({ status: "failed", error: { code: "boom" } }),
    );
    openJobEventStream.mockReturnValue({ close: vi.fn() });

    await expect(reattachToJob("job_1")).resolves.toBe(true);

    expect(openJobEventStream).not.toHaveBeenCalled();
    expect(useJobStore.getState().status).toBe("failed");
    expect(isTerminal(useJobStore.getState().status)).toBe(true);
  });

  it("reports failure when the job can no longer be read", async () => {
    getJob.mockRejectedValue(new Error("gone"));
    await expect(reattachToJob("job_1")).resolves.toBe(false);
    expect(openJobEventStream).not.toHaveBeenCalled();
  });
});

describe("TargetsPanel", () => {
  it("renders the protein, cost and amino-acid targets", () => {
    render(
      <TargetsPanel
        values={{ protein_g_per_100g: "20", cost_ceiling: "450", lysine: "55" }}
        currency="KES"
        dirty
        saving={false}
        error={null}
        onValue={vi.fn()}
        onCurrency={vi.fn()}
        onSave={vi.fn()}
      />,
    );

    expect(
      (screen.getByLabelText("Protein (g per 100 g)") as HTMLInputElement)
        .value,
    ).toBe("20");
    expect(
      (screen.getByLabelText("Cost ceiling (per kg)") as HTMLInputElement)
        .value,
    ).toBe("450");
    expect((screen.getByLabelText("Lysine") as HTMLInputElement).value).toBe(
      "55",
    );
    expect(screen.getByText("Save targets")).toBeEnabled();
  });
});
