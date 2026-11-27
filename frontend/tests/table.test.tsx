import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "./_render";

/**
 * The table primitive carries two rules the whole app depends on: a figure that
 * is compared down a column is right-aligned in the numeric face, and a value
 * the source never reported is named as missing rather than shown as zero
 * (guide §5 page 3 and §9). These pin the opt-in pieces — `numeric`, `align`,
 * the density tokens, the sortable header's `aria-sort` states, the shared
 * empty row and the loading rows — and then check the catalogue still refuses
 * to print a zero for a protein value nobody measured.
 */

const replace = vi.fn();
const listIngredients = vi.fn();
const getIngredientFacets = vi.fn();

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ replace }),
}));
vi.mock("@/lib/api/ingredients", () => ({
  listIngredients: (...args: unknown[]) => listIngredients(...args),
  getIngredientFacets: () => getIngredientFacets(),
}));

import { IngredientCatalogue } from "@/components/ingredients/ingredient-catalogue";
import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
  TableSortableHead,
  type TableSortDirection,
} from "@/components/ui/table";
import { NOT_REPORTED } from "@/lib/format";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("numeric and align tokens", () => {
  function renderCells() {
    return render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead numeric>Protein</TableHead>
            <TableHead>Form</TableHead>
            <TableHead align="end">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell numeric>23.5</TableCell>
            <TableCell>Raw</TableCell>
            <TableCell numeric align="start">
              7
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
  }

  it("right-aligns a numeric column in the numeric face, head and cells alike", () => {
    renderCells();

    const head = screen.getByRole("columnheader", { name: "Protein" });
    expect(head).toHaveClass("text-right", "font-numeric");
    expect(head).toHaveAttribute("data-numeric", "true");

    const cell = screen.getByRole("cell", { name: "23.5" });
    expect(cell).toHaveClass("text-right", "font-numeric");
    expect(cell).toHaveAttribute("data-numeric", "true");
  });

  it("leaves a text column alone", () => {
    renderCells();

    const head = screen.getByRole("columnheader", { name: "Form" });
    expect(head).toHaveClass("text-left");
    expect(head).not.toHaveClass("font-numeric");

    const cell = screen.getByRole("cell", { name: "Raw" });
    expect(cell).not.toHaveClass("font-numeric");
    expect(cell).not.toHaveAttribute("data-numeric");
  });

  it("aligns a column to an edge without claiming its contents are numbers", () => {
    renderCells();

    const head = screen.getByRole("columnheader", { name: "Actions" });
    expect(head).toHaveClass("text-right");
    expect(head).not.toHaveClass("font-numeric");
  });

  it("lets an explicit alignment win over the one numeric implies", () => {
    renderCells();

    const cell = screen.getByRole("cell", { name: "7" });
    expect(cell).toHaveClass("font-numeric", "text-left");
    expect(cell).not.toHaveClass("text-right");
  });
});

describe("density tokens", () => {
  function renderWithDensity(density?: "comfortable" | "compact") {
    return render(
      <Table density={density}>
        <TableHeader>
          <TableRow>
            <TableHead>Protein</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>23.5</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
  }

  it("keeps the comfortable rhythm by default", () => {
    renderWithDensity();

    expect(screen.getByRole("columnheader")).toHaveClass("h-10", "px-2");
    expect(screen.getByRole("cell")).toHaveClass("p-2");
  });

  it("tightens every cell at once when the table asks for compact", () => {
    renderWithDensity("compact");

    expect(screen.getByRole("columnheader")).toHaveClass("h-8");
    const cell = screen.getByRole("cell");
    expect(cell).toHaveClass("px-2", "py-1");
    expect(cell).not.toHaveClass("p-2");
  });
});

describe("striped and sticky options", () => {
  function renderTable(props: Parameters<typeof Table>[0] = {}) {
    return render(
      <Table {...props}>
        <TableHeader>
          <TableRow>
            <TableHead>Protein</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>23.5</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
  }

  it("stripes the body rows but never the header row", () => {
    renderTable({ striped: true });

    const [headerRow, bodyRow] = screen.getAllByRole("row");
    expect(headerRow).not.toHaveClass("even:bg-muted/30");
    expect(headerRow).not.toHaveAttribute("data-striped");
    expect(bodyRow).toHaveClass("even:bg-muted/30");
    expect(bodyRow).toHaveAttribute("data-striped", "true");
  });

  it("does not stripe unless asked", () => {
    renderTable();

    for (const row of screen.getAllByRole("row")) {
      expect(row).not.toHaveClass("even:bg-muted/30");
    }
  });

  it("pins the header cells and gives the existing container something to scroll", () => {
    const { container } = renderTable({ stickyHeader: true });

    const header = container.querySelector('[data-slot="table-header"]');
    expect(header).toHaveClass("[&_th]:sticky", "[&_th]:top-0");

    const wrapper = container.querySelector('[data-slot="table-container"]');
    expect(wrapper).toHaveClass("overflow-x-auto", "overflow-y-auto");
    expect(wrapper?.className).toContain(
      "max-h-[var(--table-max-height,32rem)]",
    );
  });

  it("leaves the container horizontally scrollable only when the header is not pinned", () => {
    const { container } = renderTable();

    const wrapper = container.querySelector('[data-slot="table-container"]');
    expect(wrapper).toHaveClass("overflow-x-auto");
    expect(wrapper).not.toHaveClass("overflow-y-auto");
    expect(
      container.querySelector('[data-slot="table-header"]'),
    ).not.toHaveClass("[&_th]:sticky");
  });
});

describe("TableSortableHead", () => {
  const onSortChange = vi.fn();

  function renderSortable(direction: TableSortDirection | null) {
    return render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableSortableHead
              numeric
              direction={direction}
              onSortChange={onSortChange}
            >
              Protein (g/100 g)
            </TableSortableHead>
          </TableRow>
        </TableHeader>
      </Table>,
    );
  }

  it("reports an unsorted column as sortable rather than silent", () => {
    renderSortable(null);

    expect(screen.getByRole("columnheader")).toHaveAttribute(
      "aria-sort",
      "none",
    );
    const button = screen.getByRole("button", {
      name: "Sort by Protein (g/100 g)",
    });
    expect(button).toHaveAttribute("aria-pressed", "false");
    expect(button.querySelector("svg")).toHaveClass("opacity-50");
  });

  it("puts the ascending state on the th, not only in the glyph", () => {
    renderSortable("ascending");

    expect(screen.getByRole("columnheader")).toHaveAttribute(
      "aria-sort",
      "ascending",
    );
    expect(
      screen.getByRole("button", { name: "Sort by Protein (g/100 g)" }),
    ).toHaveAttribute("aria-pressed", "true");
  });

  it("puts the descending state on the th", () => {
    renderSortable("descending");

    expect(screen.getByRole("columnheader")).toHaveAttribute(
      "aria-sort",
      "descending",
    );
  });

  it("asks for the opposite direction and sorts nothing itself", async () => {
    const user = userEvent.setup();
    renderSortable("ascending");

    await user.click(screen.getByRole("button"));
    expect(onSortChange).toHaveBeenCalledWith("descending");

    cleanup();
    renderSortable("descending");
    await user.click(screen.getByRole("button"));
    expect(onSortChange).toHaveBeenLastCalledWith("ascending");

    cleanup();
    renderSortable(null);
    await user.click(screen.getByRole("button"));
    expect(onSortChange).toHaveBeenLastCalledWith("ascending");
  });

  it("carries the numeric column's alignment onto its header", () => {
    renderSortable(null);
    expect(screen.getByRole("columnheader")).toHaveClass(
      "text-right",
      "font-numeric",
    );
  });
});

describe("TableEmpty", () => {
  function renderEmpty() {
    return render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ingredient</TableHead>
            <TableHead>Form</TableHead>
            <TableHead numeric>Protein</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableEmpty colSpan={3}>
            <p>No ingredients match these filters.</p>
            <button type="button">Clear search and filters</button>
          </TableEmpty>
        </TableBody>
      </Table>,
    );
  }

  it("spans every column so the message is not trapped under one header", () => {
    renderEmpty();

    const cell = screen.getByRole("cell");
    expect(cell).toHaveAttribute("colspan", "3");
    expect(cell).toHaveTextContent("No ingredients match these filters.");
  });

  it("keeps the headers visible so the user can see what they filtered", () => {
    renderEmpty();

    expect(
      screen.getByRole("columnheader", { name: "Ingredient" }),
    ).toBeInTheDocument();
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
  });

  it("holds the action that recovers from the empty state", () => {
    renderEmpty();

    expect(
      screen.getByRole("button", { name: "Clear search and filters" }),
    ).toBeInTheDocument();
  });
});

describe("TableSkeleton", () => {
  it("stands in for the body so the header does not move when rows arrive", () => {
    const { container } = render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ingredient</TableHead>
            <TableHead>Form</TableHead>
          </TableRow>
        </TableHeader>
        <TableSkeleton columns={2} rows={3} />
      </Table>,
    );

    const body = container.querySelector('[data-slot="table-skeleton"]');
    expect(body).toHaveAttribute("aria-busy", "true");
    expect(screen.getAllByRole("columnheader")).toHaveLength(2);
    expect(screen.getAllByRole("cell")).toHaveLength(6);
  });
});

describe("the catalogue on the new pieces", () => {
  const facets = { crops: [], forms: [], sources: [] };

  const row = (protein: number | null) => ({
    items: [
      {
        id: "ing_1",
        common_name: "Cowpea leaves",
        scientific_name: null,
        form: "Raw",
        protein_g_per_100g: protein,
        quality_flag: "estimated",
        has_amino_acids: false,
        source: { id: "kfct-2018", name: "KFCT 2018" },
      },
    ],
    total: 1,
    page: 1,
    page_size: 25,
  });

  it("names a protein value the source never reported and never prints a zero", async () => {
    getIngredientFacets.mockResolvedValue(facets);
    listIngredients.mockResolvedValue(row(null));
    renderWithProviders(<IngredientCatalogue />);

    const cell = await screen.findByRole("cell", { name: NOT_REPORTED });
    expect(cell).toHaveAttribute("data-numeric", "true");
    expect(cell).not.toHaveTextContent("0");
  });

  it("still renders a reported value in the numeric column", async () => {
    getIngredientFacets.mockResolvedValue(facets);
    listIngredients.mockResolvedValue(row(23.5));
    renderWithProviders(<IngredientCatalogue />);

    const cell = await screen.findByRole("cell", { name: "23.5" });
    expect(cell).toHaveClass("text-right", "font-numeric");
  });

  it("keeps the columns on screen when nothing matches the filters", async () => {
    getIngredientFacets.mockResolvedValue(facets);
    listIngredients.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      page_size: 25,
    });
    renderWithProviders(<IngredientCatalogue />);

    expect(
      await screen.findByText("No ingredients match these filters."),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("columnheader", { name: "Form" }),
    ).toBeInTheDocument();
  });
});
