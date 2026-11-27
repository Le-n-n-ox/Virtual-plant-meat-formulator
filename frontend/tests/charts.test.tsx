import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stubMatchMedia } from "./_matchMedia";
import { AminoAcidChart } from "@/components/ingredients/amino-acid-chart";
import { AminoAcidScoreChart } from "@/components/results/amino-acid-score-chart";
import { MacroChart } from "@/components/results/macro-chart";
import type { AminoAcidBlock, NutrientValue, NutritionResult } from "@/types";

/**
 * FE-6: every chart is tested with a normal result, a result carrying missing
 * data and an empty result, and each must keep its data-table alternative.
 */

const lysine: NutrientValue = {
  key: "lysine",
  name: "Lysine",
  value: 1.2,
  unit: "g/100g",
  flag: "analytical",
};
const methionine: NutrientValue = {
  key: "methionine",
  name: "Methionine",
  value: null,
  unit: "g/100g",
  flag: "estimated",
  reason: "not measured by the source",
};

function nutritionResult(
  overrides: Partial<NutritionResult> = {},
): NutritionResult {
  return {
    basis: "per_100g_as_formulated",
    nutrients: [
      {
        key: "protein",
        name: "Protein",
        value: 18,
        unit: "g",
        flag: "analytical",
      },
      { key: "fat", name: "Fat", value: 4, unit: "g", flag: "analytical" },
      {
        key: "carbohydrate",
        name: "Carbohydrate",
        value: 2,
        unit: "g",
        flag: "analytical",
      },
      {
        key: "fibre",
        name: "Fibre",
        value: null,
        unit: "g",
        flag: "estimated",
      },
      {
        key: "energy",
        name: "Energy",
        value: 500,
        unit: "kJ",
        flag: "calculated",
      },
    ],
    amino_acids: aminoAcidBlock(),
    calc_version: "2026.1",
    data_versions: { ingredients: "2026.1" },
    ...overrides,
  };
}

function aminoAcidBlock(
  overrides: Partial<AminoAcidBlock> = {},
): AminoAcidBlock {
  return {
    per_g_protein_mg: [{ key: "lysine", value: 58 }],
    reference_pattern: { id: "who_2013", name: "WHO 2013", version: "1" },
    scores: [
      { key: "lysine", score: 0.9 },
      { key: "methionine", score: null },
    ],
    limiting_amino_acid: "lysine",
    score: 0.9,
    method: "pattern score",
    complete: false,
    missing: ["methionine"],
    ...overrides,
  };
}

async function showTable() {
  await userEvent.click(
    screen.getByRole("button", { name: /show data table/i }),
  );
}

// The chart frame times its mount animation from the shared motion tokens,
// which read the reduced-motion media query.
beforeEach(() => stubMatchMedia());

// The vitest config does not set `globals: true`, so testing-library's
// automatic cleanup is not registered and the DOM would leak between tests.
afterEach(cleanup);

describe("AminoAcidChart", () => {
  it("renders nothing for an empty profile", () => {
    const { container } = render(<AminoAcidChart aminoAcids={[]} />);
    expect(container.firstChild).toBeNull();
  });

  it("labels a missing acid in the table instead of showing zero", async () => {
    render(<AminoAcidChart aminoAcids={[lysine, methionine]} />);
    expect(screen.getByText("Amino-acid profile")).toBeInTheDocument();
    await showTable();
    const table = screen.getByRole("table");
    expect(table).toHaveTextContent("Methionine");
    expect(table).toHaveTextContent("not reported");
    expect(table).toHaveTextContent("not measured by the source");
  });
});

describe("MacroChart", () => {
  it("renders nothing when no gram-based macronutrient is reported", () => {
    const result = nutritionResult({
      nutrients: [
        {
          key: "energy",
          name: "Energy",
          value: 500,
          unit: "kJ",
          flag: "calculated",
        },
      ],
    });
    const { container } = render(<MacroChart result={result} />);
    expect(container.firstChild).toBeNull();
  });

  it("omits energy and marks the missing fibre in the table", async () => {
    render(<MacroChart result={nutritionResult()} />);
    expect(screen.getByText("Macronutrients")).toBeInTheDocument();
    await showTable();
    const table = screen.getByRole("table");
    expect(table).toHaveTextContent("Protein");
    expect(table).toHaveTextContent("not reported");
    expect(table).not.toHaveTextContent("Energy");
  });
});

describe("AminoAcidScoreChart", () => {
  it("renders nothing when no scores are reported", () => {
    const { container } = render(
      <AminoAcidScoreChart block={aminoAcidBlock({ scores: [] })} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("names the limiting amino acid and marks a non-computable score", async () => {
    render(<AminoAcidScoreChart block={aminoAcidBlock()} />);
    expect(
      screen.getByText("Amino-acid score against the reference pattern"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("img", { name: /Limiting amino acid: Lysine/ }),
    ).toBeInTheDocument();
    await showTable();
    const table = screen.getByRole("table");
    expect(table).toHaveTextContent("Lysine");
    expect(table).toHaveTextContent("yes");
    expect(table).toHaveTextContent("not reported");
  });
});
