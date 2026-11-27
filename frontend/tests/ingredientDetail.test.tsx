import { cleanup, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "./_render";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubMatchMedia } from "./_matchMedia";

/**
 * Ingredient detail (guide §5 page 4): the nutrient and amino-acid tables carry
 * a range column with an explicit "—" when absent, an incomplete amino-acid
 * profile is called out by name, and "Add to formulation" saves a 0% line and
 * routes to the editor.
 */

const push = vi.fn();
const getIngredient = vi.fn();
const listFormulations = vi.fn();
const getFormulation = vi.fn();
const saveFormulation = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "ing_1" }),
  useRouter: () => ({ push }),
}));
vi.mock("@/lib/api/ingredients", () => ({
  getIngredient: () => getIngredient(),
}));
vi.mock("@/lib/api/formulations", () => ({
  listFormulations: (...args: unknown[]) => listFormulations(...args),
  getFormulation: (id: string) => getFormulation(id),
  saveFormulation: (id: string, body: unknown) => saveFormulation(id, body),
}));
vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => <div role="status">loading</div>,
}));

import { IngredientDetailView } from "@/components/ingredients/ingredient-detail";
import { NOT_REPORTED } from "@/lib/format";

// "Add to formulation" opens a dialog, whose open/close timing comes from the
// shared motion tokens; those read the reduced-motion media query.
beforeEach(() => stubMatchMedia());

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const base = {
  id: "ing_1",
  common_name: "Cowpea grain",
  scientific_name: "Vigna unguiculata",
  form: "Raw",
  crop: "Cowpea",
  food_group: "Legumes",
  origin: "Kenya",
  moisture_basis: "as-is",
  moisture_percent: 11.2,
  quality_flag: "analytical",
  source: {
    id: "kfct-2018",
    name: "KFCT 2018",
    license_status: "permission",
    license_notes: null,
    citation: "KFCT 2018",
  },
  dataset_version: "2018",
  functional_properties: [],
};

const nutrient = (over: Record<string, unknown> = {}) => ({
  key: "protein",
  name: "Protein",
  value: 23.5,
  unit: "g",
  flag: "analytical" as const,
  range: undefined,
  ...over,
});

describe("IngredientDetailView", () => {
  it("shows an explicit dash when a nutrient has no range", async () => {
    getIngredient.mockResolvedValue({
      ...base,
      nutrients: [
        nutrient(),
        nutrient({ key: "fat", name: "Fat", range: [2.1, 3.4] }),
      ],
      amino_acids: [],
    });
    renderWithProviders(<IngredientDetailView />);

    const rows = await screen.findAllByRole("row");
    const proteinRow = rows.find((r) => r.textContent?.includes("Protein"));
    expect(proteinRow).toBeTruthy();
    // The protein row ends with "—" (no range), the fat row carries a range.
    expect(proteinRow?.textContent).toContain("—");
    const fatRow = rows.find((r) => r.textContent?.includes("Fat"));
    expect(fatRow?.textContent).toContain("2.1–3.4");
  });

  /*
   * Below `md` the nutrient table stacks into one card per nutrient (see
   * `stackBelow` in the table primitive), so the display rules have to survive
   * the move: the value keeps its unit, and a value the source never reported
   * still reads "not reported" rather than a fabricated zero.
   */
  it("stacks each nutrient into labelled lines and keeps the units", async () => {
    getIngredient.mockResolvedValue({
      ...base,
      nutrients: [nutrient()],
      amino_acids: [],
    });
    renderWithProviders(<IngredientDetailView />);

    const value = await screen.findByRole("cell", { name: "23.5 g" });
    expect(value).toHaveAttribute("data-label", "Value");
    expect(value).toHaveClass("max-md:flex", "font-numeric");

    const name = screen.getByRole("cell", { name: "Protein" });
    expect(name).not.toHaveAttribute("data-label");
    expect(name).toHaveClass("max-md:block", "max-md:text-body");
  });

  it("still names an unreported value as missing in the stacked layout", async () => {
    getIngredient.mockResolvedValue({
      ...base,
      nutrients: [nutrient({ key: "fat", name: "Fat", value: null })],
      amino_acids: [],
    });
    renderWithProviders(<IngredientDetailView />);

    const value = await screen.findByRole("cell", { name: NOT_REPORTED });
    expect(value).toHaveAttribute("data-label", "Value");
    expect(value.textContent).toBe(NOT_REPORTED);
    expect(value.textContent).not.toMatch(/\d/);

    const card = value.closest('[data-slot="table-row"]');
    expect(card).toHaveClass("max-md:rounded-lg");
    expect(card?.textContent).not.toMatch(/\b0\b/);
  });

  it("warns by name when amino acids are missing", async () => {
    getIngredient.mockResolvedValue({
      ...base,
      nutrients: [],
      amino_acids: [
        nutrient({ key: "lysine", name: "Lysine", value: 1.6 }),
        nutrient({ key: "methionine", name: "Methionine", value: null }),
        nutrient({ key: "tryptophan", name: "Tryptophan", value: null }),
      ],
    });
    renderWithProviders(<IngredientDetailView />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Incomplete amino-acid profile");
    expect(alert).toHaveTextContent("Methionine");
    expect(alert).toHaveTextContent("Tryptophan");
    expect(alert).toHaveTextContent("partial");
    expect(alert).not.toHaveTextContent("Lysine");
  });

  it("saves the ingredient at 0% and routes to the formulation", async () => {
    const user = userEvent.setup();
    getIngredient.mockResolvedValue({
      ...base,
      nutrients: [],
      amino_acids: [],
    });
    listFormulations.mockResolvedValue({
      items: [
        {
          id: "frm_1",
          name: "Cowpea blend",
          current_version: 3,
          updated_at: "2026-01-01T00:00:00Z",
          last_job: null,
        },
      ],
      total: 1,
      page: 1,
      page_size: 25,
    });
    getFormulation.mockResolvedValue({
      id: "frm_1",
      name: "Cowpea blend",
      version: 3,
      description: null,
      lines: [{ ingredient_id: "ing_other", percent: 100 }],
    });
    saveFormulation.mockResolvedValue({ id: "frm_1", version: 4 });

    renderWithProviders(<IngredientDetailView />);

    await user.click(
      await screen.findByRole("button", { name: /Add to formulation/i }),
    );
    await user.click(await screen.findByText("Cowpea blend"));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith("/formulations/frm_1"),
    );
    expect(saveFormulation).toHaveBeenCalledWith("frm_1", {
      base_version: 3,
      lines: [
        { ingredient_id: "ing_other", percent: 100 },
        { ingredient_id: "ing_1", percent: 0 },
      ],
    });
  });

  it("keeps the picker open and reports a failed add", async () => {
    const user = userEvent.setup();
    getIngredient.mockResolvedValue({
      ...base,
      nutrients: [],
      amino_acids: [],
    });
    listFormulations.mockResolvedValue({
      items: [
        {
          id: "frm_1",
          name: "Cowpea blend",
          current_version: 3,
          updated_at: "2026-01-01T00:00:00Z",
          last_job: null,
        },
      ],
      total: 1,
      page: 1,
      page_size: 25,
    });
    getFormulation.mockResolvedValue({
      id: "frm_1",
      version: 3,
      description: null,
      lines: [],
    });
    saveFormulation.mockRejectedValue(new Error("version_conflict"));

    renderWithProviders(<IngredientDetailView />);

    await user.click(
      await screen.findByRole("button", { name: /Add to formulation/i }),
    );
    await user.click(await screen.findByText("Cowpea blend"));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("version_conflict");
    expect(push).not.toHaveBeenCalled();
  });

  it("says so when the user has no formulations", async () => {
    const user = userEvent.setup();
    getIngredient.mockResolvedValue({
      ...base,
      nutrients: [],
      amino_acids: [],
    });
    listFormulations.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 25,
    });
    renderWithProviders(<IngredientDetailView />);

    await user.click(
      await screen.findByRole("button", { name: /Add to formulation/i }),
    );
    expect(await screen.findByText(/no formulations yet/i)).toBeInTheDocument();
  });
});
