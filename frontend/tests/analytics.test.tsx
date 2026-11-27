import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "./_render";

/**
 * The Analytics page (guide §9: provenance, a data table beside every chart,
 * and missing data shown as missing). Each panel is rendered against a normal
 * response, an empty response and a rejected one, and the assertions are on the
 * `ChartTable` and stat-tile layer rather than on Plotly: the chart itself is a
 * `next/dynamic` import that never resolves under jsdom, so only its skeleton
 * and its `role="img"` wrapper exist here.
 *
 * The page may never present a count as a scientific finding, so the wording
 * that makes a count a record count is asserted too, not just the number.
 */

const getIngredientFacets = vi.fn();
const listIngredients = vi.fn();
const listJobs = vi.fn();
const listModels = vi.fn();

vi.mock("@/lib/api/ingredients", () => ({
  getIngredientFacets: () => getIngredientFacets(),
  listIngredients: (params: unknown) => listIngredients(params),
}));
vi.mock("@/lib/api/jobs", () => ({
  listJobs: (params: unknown) => listJobs(params),
}));
vi.mock("@/lib/api/models", () => ({
  listModels: (params: unknown) => listModels(params),
}));

import { CatalogueComposition } from "@/components/analytics/catalogue-composition";
import { DataQualityBreakdown } from "@/components/analytics/data-quality-breakdown";
import { JobThroughputPanel } from "@/components/analytics/job-throughput";
import { ModelCoverage } from "@/components/analytics/model-coverage";
import { StatTiles } from "@/components/analytics/stat-tiles";

type IngredientParams = { flag?: string; page_size?: number } | undefined;

function paged<T>(items: T[], total: number, pageSize: number) {
  return { items, total, page: 1, page_size: pageSize };
}

/** One catalogue record, trimmed to the fields the panels actually read. */
function ingredient(id: string, hasAminoAcids: boolean) {
  return {
    id,
    common_name: id,
    scientific_name: null,
    form: "flour",
    moisture_basis: "as_is",
    source: { id: "kfct-2018", name: "KFCT 2018" },
    protein_g_per_100g: 22,
    has_amino_acids: hasAminoAcids,
  };
}

/**
 * The catalogue answers four requests: three for a total and one for the page of
 * records the amino-acid count is tallied from.
 */
function catalogueAnswers(options: {
  total: number;
  analytical: number;
  estimated: number;
  records: ReturnType<typeof ingredient>[];
}) {
  listIngredients.mockImplementation((params: IngredientParams) => {
    if (params?.flag === "analytical")
      return Promise.resolve(paged([], options.analytical, 1));
    if (params?.flag === "estimated")
      return Promise.resolve(paged([], options.estimated, 1));
    if (params?.page_size === 1)
      return Promise.resolve(paged([], options.total, 1));
    return Promise.resolve(paged(options.records, options.total, 100));
  });
}

function job(id: string, status: string, createdAt: string, type: string) {
  return {
    id,
    type,
    formulation: { id: "frm_1", name: "Cowpea blend", version: 3 },
    status,
    stage_label: null,
    created_at: createdAt,
    started_at: createdAt,
    finished_at: createdAt,
    duration_ms: 1200,
  };
}

function model(id: string, target: string, status: string) {
  return {
    id,
    target,
    algorithm: "gradient_boosting",
    version: "1.2.0",
    training_set_size: 120,
    holdout_metric: { name: "rmse", value: 3.1 },
    status,
    dataset_version: "2026.1",
    approved_at: status === "approved" ? "2026-11-20T10:00:00Z" : null,
  };
}

/**
 * Waits for the panel's charts to appear and opens every data table, which is
 * where the numbers are asserted. A panel's card title renders while its query
 * is still pending, so this — not the title — is what tells a test the response
 * has landed.
 */
async function showEveryDataTable() {
  const buttons = await screen.findAllByRole("button", {
    name: /show data table/i,
  });
  for (const button of buttons) await userEvent.click(button);
}

const pending = () => new Promise(() => {});

beforeEach(() => {
  // jsdom has no matchMedia, and a chart primitive may reach the shared
  // reduced-motion hook. Stubbed here rather than in the shared setup file.
  vi.stubGlobal("matchMedia", (media: string) => ({
    media,
    matches: false,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  }));
  getIngredientFacets.mockReturnValue(pending());
  listIngredients.mockReturnValue(pending());
  listJobs.mockReturnValue(pending());
  listModels.mockReturnValue(pending());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("StatTiles", () => {
  it("names the count, the period and the endpoint under each tile", async () => {
    catalogueAnswers({
      total: 400,
      analytical: 300,
      estimated: 100,
      records: [ingredient("cowpea_flour", true)],
    });
    listJobs.mockResolvedValue(paged([], 342, 100));
    listModels.mockResolvedValue(paged([], 7, 100));
    renderWithProviders(<StatTiles />);

    // Each heading says "records", so no tile can be read as a measurement.
    expect(await screen.findByText("400")).toBeInTheDocument();
    expect(screen.getByText("Catalogue records")).toBeInTheDocument();
    expect(screen.getByText("Records flagged analytical")).toBeInTheDocument();
    expect(screen.getByText("300")).toBeInTheDocument();
    expect(screen.getByText("342")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();

    expect(
      screen.getAllByText("Active records in the catalogue now"),
    ).toHaveLength(2);
    expect(screen.getByText("Every job on file, all time")).toBeInTheDocument();
    // The source is the endpoint string, exactly as requested.
    expect(screen.getByText("GET /api/ingredients")).toBeInTheDocument();
    expect(
      screen.getByText("GET /api/ingredients?flag=analytical"),
    ).toBeInTheDocument();
    expect(screen.getByText("GET /api/jobs?page_size=100")).toBeInTheDocument();
  });

  it("shows a real zero for an empty catalogue and registry", async () => {
    catalogueAnswers({ total: 0, analytical: 0, estimated: 0, records: [] });
    listJobs.mockResolvedValue(paged([], 0, 100));
    listModels.mockResolvedValue(paged([], 0, 100));
    renderWithProviders(<StatTiles />);

    // Zero records is a true count here, unlike a missing measurement.
    expect(await screen.findAllByText("0")).toHaveLength(4);
  });

  it("puts the failure in the tile instead of a misleading zero", async () => {
    listIngredients.mockRejectedValue(new Error("catalogue unreachable"));
    listJobs.mockRejectedValue(new Error("jobs unreachable"));
    listModels.mockRejectedValue(new Error("registry unreachable"));
    renderWithProviders(<StatTiles />);

    const alerts = await screen.findAllByRole("alert");
    expect(alerts).toHaveLength(4);
    expect(alerts[0]).toHaveTextContent("catalogue unreachable");
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});

describe("CatalogueComposition", () => {
  it("lists every crop and form as a record count with its source", async () => {
    getIngredientFacets.mockResolvedValue({
      crops: [
        { value: "cowpea", count: 18 },
        { value: "sorghum", count: 6 },
      ],
      forms: [
        { value: "flour", count: 15 },
        { value: "raw", count: 9 },
      ],
      sources: [{ id: "kfct-2018", name: "KFCT 2018", count: 24 }],
    });
    renderWithProviders(<CatalogueComposition />);

    await showEveryDataTable();
    expect(screen.getByText("Catalogue composition")).toBeInTheDocument();
    expect(
      screen.getByText(/counts of records in the ingredient catalogue/i),
    ).toBeInTheDocument();

    const tables = screen.getAllByRole("table");
    expect(tables[0]).toHaveTextContent("Catalogue records");
    expect(tables[0]).toHaveTextContent("Cowpea");
    expect(tables[0]).toHaveTextContent("18");
    expect(tables[0]).toHaveTextContent("75%");
    expect(tables[1]).toHaveTextContent("Flour");
    expect(tables[1]).toHaveTextContent("15");

    expect(
      screen.getByText(/Source: GET \/api\/ingredients\/facets · fetched/),
    ).toBeInTheDocument();
  });

  it("says the facets are empty rather than drawing an empty chart", async () => {
    getIngredientFacets.mockResolvedValue({
      crops: [],
      forms: [],
      sources: [],
    });
    renderWithProviders(<CatalogueComposition />);

    expect(
      await screen.findByText(/no crop or form facets yet/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("surfaces the error and still names its source", async () => {
    getIngredientFacets.mockRejectedValue(new Error("facets failed"));
    renderWithProviders(<CatalogueComposition />);

    expect(await screen.findByRole("alert")).toHaveTextContent("facets failed");
    expect(
      screen.getByText(/Source: GET \/api\/ingredients\/facets/),
    ).toBeInTheDocument();
  });
});

describe("DataQualityBreakdown", () => {
  it("counts the flags over the catalogue and the amino acids over the page read", async () => {
    catalogueAnswers({
      total: 400,
      analytical: 300,
      estimated: 100,
      records: [
        ingredient("cowpea_flour", true),
        ingredient("sorghum_flour", false),
        ingredient("mung_raw", false),
        ingredient("amaranth_leaf", true),
      ],
    });
    renderWithProviders(<DataQualityBreakdown />);

    await showEveryDataTable();
    expect(screen.getByText("Data quality")).toBeInTheDocument();

    const tables = screen.getAllByRole("table");
    expect(tables[0]).toHaveTextContent("All active records");
    expect(tables[0]).toHaveTextContent("Flagged analytical");
    expect(tables[0]).toHaveTextContent("300");
    expect(tables[0]).toHaveTextContent("75%");
    expect(tables[0]).toHaveTextContent("Flagged estimated");
    expect(tables[0]).toHaveTextContent("25%");
    // The catalogue's flag filter matches a record when the record or any value
    // on it carries the flag, so the two counts overlap and the panel says so
    // rather than drawing them as two halves of the catalogue.
    expect(
      screen.getByText(/overlap and do not add up to the total/),
    ).toBeInTheDocument();

    // Two of the four records read carry no amino-acid profile, and the panel
    // says the count covers the page it read, not the catalogue.
    expect(tables[1]).toHaveTextContent("No amino-acid profile recorded");
    expect(tables[1]).toHaveTextContent("first 4 records of 400");
    expect(
      screen.getByText(/Counted in the 4 records of the first page only/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/so this is not a catalogue-wide count/),
    ).toBeInTheDocument();
  });

  it("says the catalogue is empty rather than reporting a 0% share", async () => {
    catalogueAnswers({ total: 0, analytical: 0, estimated: 0, records: [] });
    renderWithProviders(<DataQualityBreakdown />);

    expect(
      await screen.findByText(/holds no active records/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("surfaces the error instead of a blank panel", async () => {
    listIngredients.mockRejectedValue(new Error("quality counts failed"));
    renderWithProviders(<DataQualityBreakdown />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "quality counts failed",
    );
  });
});

describe("JobThroughputPanel", () => {
  it("names the fetched window and buckets only what it fetched", async () => {
    listJobs.mockResolvedValue(
      paged(
        [
          job("job_1", "completed", "2026-11-26T09:30:00Z", "nutrition"),
          job("job_2", "failed", "2026-11-25T08:00:00Z", "optimization"),
          job("job_3", "completed", "2026-11-25T11:00:00Z", "nutrition"),
        ],
        342,
        100,
      ),
    );
    renderWithProviders(<JobThroughputPanel />);

    await showEveryDataTable();
    expect(screen.getByText("Job throughput and outcomes")).toBeInTheDocument();
    // The window is stated, not implied: how many records, which days, and how
    // many job records exist that this page never saw.
    expect(
      screen.getByText(/created between 2026-11-25 and 2026-11-26 \(UTC\)/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/There are 342 job records on file/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /the charts below bucket the window, not the full history/i,
      ),
    ).toBeInTheDocument();

    const tables = screen.getAllByRole("table");
    expect(tables[0]).toHaveTextContent("Day (UTC)");
    expect(tables[0]).toHaveTextContent("2026-11-25");
    expect(tables[0]).toHaveTextContent("2026-11-26");
    expect(tables[1]).toHaveTextContent("Nutrition");
    expect(tables[1]).toHaveTextContent("Optimization");
    expect(
      screen.getByText(/Source: GET \/api\/jobs\?page_size=100 · fetched/),
    ).toBeInTheDocument();
  });

  it("says no job has run rather than drawing an empty series", async () => {
    listJobs.mockResolvedValue(paged([], 0, 100));
    renderWithProviders(<JobThroughputPanel />);

    expect(await screen.findByText(/No job has run yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("surfaces the error instead of an empty window", async () => {
    listJobs.mockRejectedValue(new Error("job history failed"));
    renderWithProviders(<JobThroughputPanel />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "job history failed",
    );
    expect(screen.queryByText(/Window:/)).not.toBeInTheDocument();
  });
});

describe("ModelCoverage", () => {
  it("counts registry records per target and how many are approved", async () => {
    listModels.mockResolvedValue(
      paged(
        [
          model("mdl_1", "hardness", "approved"),
          model("mdl_2", "hardness", "candidate"),
          model("mdl_3", "chewiness", "retired"),
        ],
        3,
        100,
      ),
    );
    renderWithProviders(<ModelCoverage />);

    await showEveryDataTable();
    expect(screen.getByText("Model coverage")).toBeInTheDocument();
    expect(
      screen.getByText(/targets have at least one approved model record/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/not a measure of how well any model performs/),
    ).toBeInTheDocument();

    const table = screen.getByRole("table");
    expect(table).toHaveTextContent("Model records");
    expect(table).toHaveTextContent("Hardness");
    expect(table).toHaveTextContent("Chewiness");
    expect(table).toHaveTextContent("Approved");
    expect(table).toHaveTextContent("Retired");
  });

  it("says the registry is empty rather than showing full coverage", async () => {
    listModels.mockResolvedValue(paged([], 0, 100));
    renderWithProviders(<ModelCoverage />);

    expect(
      await screen.findByText(/No model has been trained yet/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("surfaces the error instead of implying no models exist", async () => {
    listModels.mockRejectedValue(new Error("registry failed"));
    renderWithProviders(<ModelCoverage />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "registry failed",
    );
    expect(
      screen.queryByText(/targets have at least one approved/),
    ).not.toBeInTheDocument();
  });
});
