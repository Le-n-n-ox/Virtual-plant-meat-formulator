import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "./_render";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The dashboard's two panels (guide §5 page 2). `useApiQuery` is stubbed at the
 * fetch level so the loading, empty, error and populated states can all be
 * asserted without a backend.
 */

const listJobs = vi.fn();
const listIngredients = vi.fn();
const getIngredientFacets = vi.fn();

vi.mock("@/lib/api/jobs", () => ({ listJobs: () => listJobs() }));
vi.mock("@/lib/api/ingredients", () => ({
  listIngredients: () => listIngredients(),
  getIngredientFacets: () => getIngredientFacets(),
}));
vi.mock("next/link", () => ({
  default: ({
    href,
    children,
  }: {
    href: string;
    children: React.ReactNode;
  }) => <a href={href}>{children}</a>,
}));
vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => <div role="status">loading</div>,
}));

import { RecentJobs } from "@/components/jobs/recent-jobs";
import { DataQualityNotice } from "@/components/dashboard/data-quality-notice";

afterEach(() => {
  vi.clearAllMocks();
});

describe("RecentJobs", () => {
  it("shows a loading state", () => {
    listJobs.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<RecentJobs />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an empty state when no job has run", async () => {
    listJobs.mockResolvedValue({ items: [], total: 0, page: 1, page_size: 5 });
    renderWithProviders(<RecentJobs />);
    expect(
      await screen.findByText(/No jobs have run yet/i),
    ).toBeInTheDocument();
  });

  it("surfaces an error instead of a blank panel", async () => {
    listJobs.mockRejectedValue(new Error("boom"));
    renderWithProviders(<RecentJobs />);
    expect(await screen.findByRole("alert")).toHaveTextContent("boom");
  });

  it("lists jobs with a status badge and a link to the job page", async () => {
    listJobs.mockResolvedValue({
      items: [
        {
          id: "job_1",
          type: "nutrition",
          formulation: { id: "frm_1", name: "Cowpea blend", version: 3 },
          status: "running",
          stage_label: "Calculating nutrition",
        },
        {
          id: "job_2",
          type: "optimization",
          formulation: { id: "frm_1", name: "Cowpea blend", version: 2 },
          status: "failed",
          stage_label: null,
        },
      ],
      total: 2,
      page: 1,
      page_size: 5,
    });
    renderWithProviders(<RecentJobs />);

    const links = await screen.findAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual([
      "/jobs/job_1",
      "/jobs/job_2",
    ]);
    expect(screen.getAllByText("Cowpea blend")).toHaveLength(2);
    expect(screen.getByText(/v3/)).toBeInTheDocument();
    expect(screen.getByText("Running")).toBeInTheDocument();
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });
});

describe("DataQualityNotice", () => {
  it("says nothing while the counts load", () => {
    listIngredients.mockReturnValue(new Promise(() => {}));
    getIngredientFacets.mockResolvedValue({
      crops: [],
      forms: [],
      sources: [],
    });
    renderWithProviders(<DataQualityNotice />);
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  });

  it("says nothing when every row is analytical", async () => {
    listIngredients.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 1,
    });
    getIngredientFacets.mockResolvedValue({
      crops: [],
      forms: [],
      sources: [{ id: "kfct-2018", name: "KFCT 2018", count: 527 }],
    });
    const { container } = renderWithProviders(<DataQualityNotice />);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("counts the estimated rows and links to the catalogue", async () => {
    listIngredients.mockResolvedValue({
      items: [],
      total: 41,
      page: 1,
      page_size: 1,
    });
    getIngredientFacets.mockResolvedValue({
      crops: [],
      forms: [],
      sources: [{ id: "kfct-2018", name: "KFCT 2018", count: 527 }],
    });
    renderWithProviders(<DataQualityNotice />);
    expect(await screen.findByText("Data quality")).toBeInTheDocument();
    expect(screen.getByText("41")).toBeInTheDocument();
    expect(
      screen.getByText(/estimated rather than analytically/),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Browse the catalogue/i }),
    ).toHaveAttribute("href", "/ingredients");
  });
});
