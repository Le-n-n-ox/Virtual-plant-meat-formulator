import { cleanup, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "./_render";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * The catalogue's filters must be shareable and restorable (guide §5 page 3):
 * the address bar holds q, crop, form, source, flag, sort and page. These pin
 * the query <-> URL round trip and the component's requests.
 */

const replace = vi.fn();
const listIngredients = vi.fn();
const getIngredientFacets = vi.fn();
let search = "";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(search),
  useRouter: () => ({ replace }),
}));
vi.mock("@/lib/api/ingredients", () => ({
  listIngredients: (...args: unknown[]) => listIngredients(...args),
  getIngredientFacets: () => getIngredientFacets(),
}));
vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: () => <div role="status">loading</div>,
}));

import {
  IngredientCatalogue,
  readParams,
  toQueryString,
} from "@/components/ingredients/ingredient-catalogue";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  search = "";
});

const facets = {
  crops: [{ value: "Cowpea", count: 12 }],
  forms: [{ value: "Raw", count: 8 }],
  sources: [{ id: "kfct-2018", name: "KFCT 2018", count: 527 }],
};

describe("catalogue query round trip", () => {
  it("reads every filter back out of the URL", () => {
    const p = readParams(
      "?q=cowpea&crop=Cowpea&form=Raw&source=kfct-2018&flag=estimated&sort=-protein&page=3",
    );
    expect(p).toEqual({
      q: "cowpea",
      crop: "Cowpea",
      form: "Raw",
      source: "kfct-2018",
      flag: "estimated",
      sort: "-protein",
      page: 3,
    });
  });

  it("drops unknown flags, sorts and pages instead of trusting the URL", () => {
    const p = readParams("?flag=bogus&sort=name&page=0&page=-4");
    expect(p.flag).toBe("");
    expect(p.sort).toBe("common_name");
    expect(p.page).toBe(1);
  });

  it("omits the defaults and serialises back losslessly", () => {
    const p = readParams(
      "?crop=Cowpea&form=Raw&source=kfct-2018&flag=estimated&sort=-protein&page=2",
    );
    expect(toQueryString(p)).toBe(
      "crop=Cowpea&form=Raw&source=kfct-2018&flag=estimated&sort=-protein&page=2",
    );
    expect(toQueryString(readParams(""))).toBe("");
  });
});

describe("IngredientCatalogue", () => {
  it("requests with the filters restored from the URL", async () => {
    search =
      "?crop=Cowpea&form=Raw&source=kfct-2018&flag=estimated&sort=-protein&page=2";
    getIngredientFacets.mockResolvedValue(facets);
    listIngredients.mockResolvedValue({
      items: [],
      total: 0,
      page: 2,
      page_size: 25,
    });
    renderWithProviders(<IngredientCatalogue />);

    await waitFor(() => expect(listIngredients).toHaveBeenCalled());
    expect(listIngredients).toHaveBeenLastCalledWith({
      q: undefined,
      form: "Raw",
      crop: "Cowpea",
      source_id: "kfct-2018",
      flag: "estimated",
      sort: "-protein",
      page: 2,
      page_size: 25,
      exclude_animal_groups: true,
    });
  });

  it("offers the facet values as filter options", async () => {
    getIngredientFacets.mockResolvedValue(facets);
    listIngredients.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 25,
    });
    renderWithProviders(<IngredientCatalogue />);

    const source = await screen.findByLabelText("Filter by data source");
    expect(source).toHaveValue("");
    expect(
      await screen.findByRole("option", { name: "KFCT 2018 (527)" }),
    ).toBeInTheDocument();
  });

  it("writes a filter change into the URL and restarts on page 1", async () => {
    const user = userEvent.setup();
    getIngredientFacets.mockResolvedValue(facets);
    listIngredients.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 25,
    });
    search = "?crop=Cowpea&page=3";
    renderWithProviders(<IngredientCatalogue />);

    await user.selectOptions(
      screen.getByLabelText("Filter by data quality"),
      "estimated",
    );

    expect(replace).toHaveBeenCalledWith(
      "/ingredients?crop=Cowpea&flag=estimated",
      { scroll: false },
    );
  });

  it("toggles sort direction through the URL", async () => {
    const user = userEvent.setup();
    getIngredientFacets.mockResolvedValue(facets);
    listIngredients.mockResolvedValue({
      items: [
        {
          id: "ing_1",
          common_name: "Cowpea grain",
          scientific_name: null,
          form: "Raw",
          protein_g_per_100g: 23.5,
          quality_flag: "analytical",
          has_amino_acids: false,
          source: { id: "kfct-2018", name: "KFCT 2018" },
        },
      ],
      total: 1,
      page: 1,
      page_size: 25,
    });
    search = "?sort=protein";
    renderWithProviders(<IngredientCatalogue />);

    const head = await screen.findByLabelText("Sort by Protein (g/100 g)");
    expect(head).toHaveAttribute("aria-pressed", "true");
    await user.click(head);

    expect(replace).toHaveBeenCalledWith("/ingredients?sort=-protein", {
      scroll: false,
    });
  });
});
