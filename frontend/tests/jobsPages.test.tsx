import { cleanup, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "./_render";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Jobs pages (guide §5 page 14): list filters live in the URL, and the detail
 * page follows a job started elsewhere by reattaching to its stream.
 */

const replace = vi.fn();
const push = vi.fn();
const listJobs = vi.fn();
const listFormulations = vi.fn();
const getJob = vi.fn();
const cancelJob = vi.fn();
const reattachToJob = vi.fn();
const openJobEventStream = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "job_1" }),
  useRouter: () => ({ replace, push }),
  useSearchParams: () => new URLSearchParams(search),
}));
vi.mock("@/lib/api/jobs", () => ({
  listJobs: (...args: unknown[]) => listJobs(...args),
  getJob: (id: string) => getJob(id),
  cancelJob: (id: string) => cancelJob(id),
}));
vi.mock("@/lib/api/formulations", () => ({
  listFormulations: (...args: unknown[]) => listFormulations(...args),
}));
vi.mock("@/lib/jobs/job-runner", () => ({
  reattachToJob: (id: string) => reattachToJob(id),
  describeRunError: (_code: string, message: string) => message,
}));
vi.mock("@/lib/sse/jobEventSource", () => ({
  openJobEventStream: (...args: unknown[]) => openJobEventStream(...args),
}));
vi.mock("@/lib/api/results", () => ({ getNutrition: vi.fn() }));
vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => <div role="status">loading</div>,
}));

import { JobList, readParams, toQueryString } from "@/components/jobs/job-list";
import { JobDetailView } from "@/components/jobs/job-detail";

let search = "";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  search = "";
});

const paged = (items: unknown[]) => ({
  items,
  total: items.length,
  page: 1,
  page_size: 20,
});

const jobItem = (over: Record<string, unknown> = {}) => ({
  id: "job_1",
  type: "nutrition",
  formulation: { id: "frm_1", name: "Cowpea blend", version: 3 },
  status: "completed",
  stage_label: null,
  created_at: "2026-01-01T00:00:00Z",
  started_at: null,
  finished_at: null,
  duration_ms: null,
  ...over,
});

describe("job list filters in the URL", () => {
  it("round-trips status, type, formulation and page", () => {
    const p = readParams(
      "?status=running&type=optimization&formulation=frm_9&page=3",
    );
    expect(p).toEqual({
      status: "running",
      type: "optimization",
      formulation: "frm_9",
      page: 3,
    });
    expect(toQueryString(p)).toBe(
      "status=running&type=optimization&formulation=frm_9&page=3",
    );
  });

  it("drops unknown values and omits the defaults", () => {
    expect(readParams("?status=bogus&type=nope&page=-2").status).toBe("");
    expect(readParams("?status=bogus&type=nope&page=-2").type).toBe("");
    expect(readParams("?status=bogus&type=nope&page=-2").page).toBe(1);
    expect(toQueryString(readParams(""))).toBe("");
  });

  it("requests with the filters restored from the URL", async () => {
    search = "?status=running&type=optimization&formulation=frm_9";
    listJobs.mockResolvedValue(paged([]));
    listFormulations.mockResolvedValue(paged([]));
    renderWithProviders(<JobList />);

    await waitFor(() => expect(listJobs).toHaveBeenCalled());
    expect(listJobs).toHaveBeenLastCalledWith({
      status: "running",
      type: "optimization",
      formulation_id: "frm_9",
      page: 1,
      page_size: 20,
    });
  });

  it("writes a filter change into the URL and restarts on page 1", async () => {
    const user = userEvent.setup();
    listJobs.mockResolvedValue(paged([jobItem()]));
    listFormulations.mockResolvedValue(
      paged([
        {
          id: "frm_1",
          name: "Cowpea blend",
          current_version: 3,
          updated_at: "2026-01-01T00:00:00Z",
          last_job: null,
        },
      ]),
    );
    search = "?page=4";
    renderWithProviders(<JobList />);

    await user.selectOptions(
      screen.getByLabelText("Filter by status"),
      "failed",
    );
    expect(replace).toHaveBeenCalledWith("/jobs?status=failed", {
      scroll: false,
    });
  });

  it("offers the user's formulations as options", async () => {
    listJobs.mockResolvedValue(paged([]));
    listFormulations.mockResolvedValue(
      paged([
        {
          id: "frm_1",
          name: "Cowpea blend",
          current_version: 3,
          updated_at: "2026-01-01T00:00:00Z",
          last_job: null,
        },
      ]),
    );
    renderWithProviders(<JobList />);

    expect(
      await screen.findByRole("option", { name: "Cowpea blend" }),
    ).toBeInTheDocument();
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
  candidate_ids: [],
  result_available: false,
  last_event_seq: 1,
  created_at: "2026-01-01T00:00:00Z",
  started_at: "2026-01-01T00:00:01Z",
  finished_at: null,
  data_versions: {},
  calc_version: "v2",
  ...over,
});

describe("JobDetailView", () => {
  it("attaches to a running job on load and shows the live timeline", async () => {
    getJob.mockResolvedValue(jobStatus());
    reattachToJob.mockResolvedValue(true);
    renderWithProviders(<JobDetailView />);

    expect(
      await screen.findByText(/Attach to live stream/i),
    ).toBeInTheDocument();
    await waitFor(() => expect(reattachToJob).toHaveBeenCalledWith("job_1"));
  });

  it("shows the event log and a link to the result tab", async () => {
    getJob.mockResolvedValue(
      jobStatus({
        status: "completed",
        finished_at: "2026-01-01T00:01:00Z",
        result_available: true,
      }),
    );
    renderWithProviders(<JobDetailView />);

    expect(await screen.findByText("Event log")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "View result" })).toHaveAttribute(
      "href",
      "/formulations/frm_1/candidates",
    );
  });

  it("links a nutrition job to its nutrition tab", async () => {
    getJob.mockResolvedValue(
      jobStatus({
        type: "nutrition",
        status: "completed",
        result_available: true,
      }),
    );
    renderWithProviders(<JobDetailView />);
    expect(
      await screen.findByRole("link", { name: "View result" }),
    ).toHaveAttribute("href", "/formulations/frm_1/nutrition");
  });

  it("cancels a running job", async () => {
    const user = userEvent.setup();
    getJob.mockResolvedValue(jobStatus());
    reattachToJob.mockResolvedValue(true);
    cancelJob.mockResolvedValue({ accepted: true });
    renderWithProviders(<JobDetailView />);

    await user.click(await screen.findByRole("button", { name: /Cancel/i }));
    await waitFor(() => expect(cancelJob).toHaveBeenCalledWith("job_1"));
  });

  it("reports a failed attach instead of pretending it is live", async () => {
    getJob.mockResolvedValue(jobStatus());
    reattachToJob.mockResolvedValue(false);
    renderWithProviders(<JobDetailView />);

    await userEvent
      .setup()
      .click(
        await screen.findByRole("button", { name: /Attach to live stream/i }),
      );
    expect(await screen.findByRole("alert")).toHaveTextContent(
      /could not be read/i,
    );
  });
});
