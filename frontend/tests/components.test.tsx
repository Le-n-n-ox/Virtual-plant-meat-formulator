import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "./_render";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Component tests for the pieces that carry the app's truthfulness rules: the
 * formulation table and totals bar (validated state only), the job progress
 * timeline, the model provenance badge and the shared error block.
 */

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "frm_1" }),
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/api/ingredients", () => ({
  listIngredients: vi.fn(),
  getIngredient: vi.fn(),
  listNutrients: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/api/formulations", () => ({
  saveFormulation: vi.fn(),
  listFormulations: vi.fn(),
}));
vi.mock("@/lib/api/jobs", () => ({ cancelJob: vi.fn() }));
vi.mock("@/lib/jobs/job-runner", () => ({
  runJob: vi.fn(),
  describeRunError: (_code: string, message: string) => message,
}));
vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => <div role="status">loading</div>,
}));

import { ErrorBlock } from "@/components/workspace/error-block";
import { FormulationEditor } from "@/components/formulation/formulation-editor";
import { JobProgress } from "@/components/jobs/job-progress";
import { ModelBadge } from "@/components/models/model-badge";
import { useFormulationStore } from "@/stores/formulationStore";
import { useJobStore } from "@/stores/jobStore";
import { useResultStore } from "@/stores/resultStore";
import type {
  Formulation,
  Ingredient,
  JobEvent,
  ModelMeta,
  ValidationResult,
} from "@/types";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ingredient = (id: string, name: string): Ingredient => ({
  id,
  common_name: name,
  scientific_name: null,
  form: "Raw",
  crop: "Cowpea",
  food_group: "Legumes",
  origin: "Kenya",
  moisture_basis: "as-is",
  moisture_percent: 11,
  quality_flag: "analytical",
  source: {
    id: "kfct-2018",
    name: "KFCT 2018",
    license_status: "permission",
    license_notes: null,
    citation: "KFCT 2018",
  },
  dataset_version: "2018",
  nutrients: [],
  amino_acids: [],
  functional_properties: [],
});

const formulation: Formulation = {
  id: "frm_1",
  name: "Cowpea blend",
  version: 2,
  description: null,
  lines: [
    { ingredient_id: "ing_a", percent: 60 },
    { ingredient_id: "ing_b", percent: 40 },
  ],
  targets: {},
  updated_at: "2026-01-01T00:00:00Z",
};

function seedEditor(
  over: Partial<Formulation> = {},
  result?: ValidationResult,
) {
  useResultStore.getState().clear();
  useFormulationStore
    .getState()
    .loadFormulation({ ...formulation, ...over }, [
      ingredient("ing_a", "Cowpea grain"),
      ingredient("ing_b", "Sorghum grain"),
    ]);
  const lines = useFormulationStore.getState().draft;
  useFormulationStore.getState().applyValidation(0, lines, {
    valid: true,
    total_percent: 100,
    issues: [],
    ...result,
  });
}

beforeEach(() => {
  useFormulationStore.getState().reset();
  useJobStore.getState().reset();
  useResultStore.getState().clear();
});

describe("FormulationEditor table and totals bar", () => {
  it("lists each draft line with its form and an editable percentage", () => {
    seedEditor();
    renderWithProviders(<FormulationEditor />);

    expect(screen.getByText("Cowpea grain")).toBeInTheDocument();
    expect(screen.getByText("Sorghum grain")).toBeInTheDocument();
    const percents = screen.getAllByLabelText(/^Percentage of /);
    expect(percents).toHaveLength(2);
    expect((percents[0] as HTMLInputElement).value).toBe("60");
  });

  it("updates the draft immediately when a percentage is typed", async () => {
    const user = userEvent.setup();
    seedEditor();
    renderWithProviders(<FormulationEditor />);

    const first = screen.getAllByLabelText(/^Percentage of /)[0];
    await user.clear(first);
    await user.type(first, "70");

    await waitFor(() =>
      expect(useFormulationStore.getState().draft[0].percent).toBe(70),
    );
  });

  it("removes a line without touching the others", async () => {
    const user = userEvent.setup();
    seedEditor();
    renderWithProviders(<FormulationEditor />);

    await user.click(
      screen.getByRole("button", { name: "Remove Cowpea grain" }),
    );

    const draft = useFormulationStore.getState().draft;
    expect(draft).toHaveLength(1);
    expect(draft[0].ingredient_id).toBe("ing_b");
  });

  it("shows the server's total and a valid state at 100 percent", () => {
    seedEditor();
    renderWithProviders(<FormulationEditor />);

    expect(screen.getByText(/Total 100%/)).toBeInTheDocument();
    expect(screen.getByText(/Valid — scene updated/)).toBeInTheDocument();
  });

  it("flags an invalid total with the server message", () => {
    seedEditor(
      { lines: [{ ingredient_id: "ing_a", percent: 90 }] },
      {
        valid: false,
        total_percent: 90,
        issues: [{ code: "total", message: "Total must be exactly 100%." }],
      },
    );
    renderWithProviders(<FormulationEditor />);

    expect(screen.getByText(/Total 90%/)).toBeInTheDocument();
    expect(screen.getByText("Needs attention")).toBeInTheDocument();
    expect(screen.getByText("Total must be exactly 100%.")).toBeInTheDocument();
  });

  it("names a per-ingredient issue in the row", () => {
    seedEditor(
      {},
      {
        valid: false,
        total_percent: 100,
        issues: [
          {
            ingredient_id: "ing_a",
            code: "percent",
            message: "Cowpea grain is below its minimum.",
          },
        ],
      },
    );
    renderWithProviders(<FormulationEditor />);

    expect(
      screen.getByText("Cowpea grain is below its minimum."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Percentage of Cowpea grain")).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("marks unsaved edits and blocks saving while invalid", () => {
    seedEditor();
    const store = useFormulationStore.getState();
    store.setPercent("ing_a", 55);
    renderWithProviders(<FormulationEditor />);

    expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Save$/ })).toBeDisabled();
  });
});

const event = (over: Partial<JobEvent> = {}): JobEvent => ({
  job_id: "job_1",
  event: "stage.updated",
  status: "running",
  stage: "calculating",
  stage_label: "Calculating nutrition",
  progress_percent: 40,
  candidate_id: null,
  timestamp: "2026-01-01T00:00:02Z",
  seq: 1,
  ...over,
});

describe("JobProgress timeline", () => {
  it("shows the stages the worker reported, with their status", () => {
    useJobStore.getState().startJob("job_1", "nutrition");
    useJobStore
      .getState()
      .applyEvent(
        event({ stage: "validating", stage_label: "Validating", seq: 1 }),
      );
    useJobStore
      .getState()
      .applyEvent(
        event({
          stage: "calculating",
          stage_label: "Calculating nutrition",
          seq: 2,
        }),
      );
    renderWithProviders(<JobProgress types={["nutrition"]} />);

    expect(screen.getByText("Validating")).toBeInTheDocument();
    expect(screen.getByText("Calculating nutrition")).toBeInTheDocument();
    expect(screen.getByText("done")).toBeInTheDocument();
    expect(screen.getByText("in progress")).toBeInTheDocument();
  });

  it("reports a measured percentage through the progress bar", () => {
    useJobStore.getState().startJob("job_1", "nutrition");
    useJobStore.getState().applyEvent(event({ progress_percent: 42, seq: 1 }));
    renderWithProviders(<JobProgress types={["nutrition"]} />);

    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "42");
  });

  it("stays indeterminate when the worker sent no percentage", () => {
    useJobStore.getState().startJob("job_1", "nutrition");
    useJobStore
      .getState()
      .applyEvent(event({ progress_percent: null, seq: 1 }));
    renderWithProviders(<JobProgress types={["nutrition"]} />);

    expect(screen.getByRole("progressbar")).not.toHaveAttribute(
      "aria-valuenow",
    );
  });

  it("shows warnings raised by the worker", () => {
    useJobStore.getState().startJob("job_1", "nutrition");
    useJobStore.getState().applyEvent(
      event({
        event: "warning.raised",
        stage: "calculating",
        message: "Some values are estimated",
        seq: 1,
      }),
    );
    renderWithProviders(<JobProgress types={["nutrition"]} />);

    expect(screen.getByText("Some values are estimated")).toBeInTheDocument();
  });

  it("does not render for a different job type", () => {
    useJobStore.getState().startJob("job_1", "texture_prediction");
    const { container } = renderWithProviders(
      <JobProgress types={["nutrition"]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("offers a cancel action while the job runs", () => {
    useJobStore.getState().startJob("job_1", "nutrition");
    renderWithProviders(<JobProgress types={["nutrition"]} cancellable />);

    expect(screen.getByRole("button", { name: /Cancel/ })).toBeInTheDocument();
  });
});

const model: ModelMeta = {
  id: "mod_1",
  target: "hardness",
  algorithm: "random_forest",
  version: "3",
  training_set_size: 1284,
  holdout_metric: { name: "rmse", value: 0.42 },
};

describe("ModelBadge provenance chip", () => {
  it("states the model, its training set and the held-out score", () => {
    renderWithProviders(<ModelBadge model={model} />);

    const badge = screen.getByText(/Hardness/);
    expect(badge).toHaveTextContent(/Random forest/);
    expect(badge).toHaveTextContent(/v\s*3/);
    expect(
      screen.getByText(/trained on 1284 literature samples/),
    ).toBeInTheDocument();
    expect(screen.getByText(/holdout RMSE 0.42/)).toBeInTheDocument();
  });

  it("links to the model registry so the version on a result is reachable", () => {
    renderWithProviders(<ModelBadge model={model} />);
    expect(
      screen.getByRole("link", { name: "Model registry" }),
    ).toHaveAttribute("href", "/models");
  });

  it("omits the held-out score when the model has none", () => {
    renderWithProviders(
      <ModelBadge model={{ ...model, holdout_metric: undefined }} />,
    );
    expect(screen.queryByText(/holdout/)).not.toBeInTheDocument();
  });
});

describe("ErrorBlock", () => {
  it("shows the message with a dedicated title", () => {
    render(
      <ErrorBlock
        error={{
          code: "infeasible",
          message: "No mix meets every constraint.",
          issues: [],
          violated: [],
        }}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("No feasible formulation");
    expect(alert).toHaveTextContent("No mix meets every constraint.");
  });

  it("lists the fields that failed and the constraints that cannot be met", () => {
    render(
      <ErrorBlock
        error={{
          code: "validation_failed",
          message: "The request is not valid.",
          issues: [{ field: "protein", message: "below the minimum" }],
          violated: ["protein_g_per_100g >= 20"],
        }}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("below the minimum");
    expect(alert).toHaveTextContent("Constraints that cannot be met");
    expect(alert).toHaveTextContent("protein_g_per_100g >= 20");
  });

  it("renders an unknown code without inventing a title", () => {
    render(
      <ErrorBlock
        error={{
          code: "something_new",
          message: "Plain message.",
          issues: [],
          violated: [],
        }}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Plain message.");
    expect(
      screen.queryByText("The request is not valid"),
    ).not.toBeInTheDocument();
  });
});
