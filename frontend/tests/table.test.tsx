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

/**
 * `stackBelow` is the narrow-screen layout: below its breakpoint every row
 * becomes a card of labelled lines, so a five-column table is readable on a
 * phone without dragging it left and right. These pin the shape of that card,
 * that the column labels never leak into a value, that the scrollport and the
 * sticky window wait for the breakpoint, and that a table which did not ask for
 * any of it is untouched.
 */
describe("stacked rows below a breakpoint", () => {
  function renderStacked(props: Parameters<typeof Table>[0] = {}) {
    return render(
      <Table stackBelow="lg" {...props}>
        <TableHeader>
          <TableRow>
            <TableHead>Ingredient</TableHead>
            <TableHead numeric>Protein (g/100 g)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Cowpea leaves</TableCell>
            <TableCell numeric label="Protein (g/100 g)">
              23.5
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );
  }

  it("makes a card of each row and drops the header its labels replace", () => {
    const { container } = renderStacked();

    const table = container.querySelector('[data-slot="table"]');
    expect(table).toHaveAttribute("data-stack", "lg");
    expect(table).toHaveClass("max-lg:block");
    expect(container.querySelector('[data-slot="table-header"]')).toHaveClass(
      "max-lg:hidden",
    );
    expect(container.querySelector('[data-slot="table-body"]')).toHaveClass(
      "max-lg:flex",
      "max-lg:flex-col",
      "max-lg:gap-3",
    );

    const [, row] = screen.getAllByRole("row");
    expect(row).toHaveClass(
      "max-lg:block",
      "max-lg:rounded-lg",
      "max-lg:border",
      "max-lg:p-3",
    );
  });

  it("leaves the last card a border, which a table row would not need", () => {
    const { container } = renderStacked();

    const body = container.querySelector('[data-slot="table-body"]');
    expect(body).toHaveClass("lg:[&_tr:last-child]:border-0");
    expect(body).not.toHaveClass("[&_tr:last-child]:border-0");
  });

  it("names a value with its column without making the name part of it", () => {
    renderStacked();

    const cell = screen.getByRole("cell", { name: "23.5" });
    expect(cell).toHaveAttribute("data-label", "Protein (g/100 g)");
    expect(cell.className).toContain(
      "max-lg:before:content-[attr(data-label)]",
    );
    expect(cell).toHaveClass("max-lg:flex", "max-lg:justify-between");
    // The label is drawn from the attribute, so the cell's text is the value.
    expect(cell.textContent).toBe("23.5");
    expect(cell).toHaveClass("font-numeric");
  });

  it("keeps the identifying column as the card's first line", () => {
    renderStacked();

    const cell = screen.getByRole("cell", { name: "Cowpea leaves" });
    expect(cell).not.toHaveAttribute("data-label");
    expect(cell).toHaveClass("max-lg:block", "max-lg:text-body");
    expect(cell.className).not.toContain("before:content");
  });

  it("wraps a long value rather than widening the card past the screen", () => {
    renderStacked();

    expect(screen.getByRole("cell", { name: "23.5" })).toHaveClass(
      "max-lg:whitespace-normal",
      "max-lg:break-words",
    );
  });

  it("restates the roles that display:block would otherwise drop", () => {
    const { container } = renderStacked();

    expect(container.querySelector('[data-slot="table"]')).toHaveAttribute(
      "role",
      "table",
    );
    expect(container.querySelector('[data-slot="table-body"]')).toHaveAttribute(
      "role",
      "rowgroup",
    );
    const [, row] = screen.getAllByRole("row");
    expect(row).toHaveAttribute("role", "row");
    expect(screen.getByRole("cell", { name: "23.5" })).toHaveAttribute(
      "role",
      "cell",
    );
    expect(
      screen.getByRole("columnheader", { name: "Ingredient" }),
    ).toHaveAttribute("role", "columnheader");
  });

  it("waits for the breakpoint before it scrolls or pins anything", () => {
    const { container } = renderStacked({ stickyHeader: true });

    const wrapper = container.querySelector('[data-slot="table-container"]');
    expect(wrapper).toHaveClass(
      "lg:overflow-x-auto",
      "lg:overflow-y-auto",
      "lg:overscroll-contain",
    );
    expect(wrapper).not.toHaveClass("overflow-x-auto", "overflow-y-auto");
    // No inner 32rem scroll region inside the page's own scroll on a phone.
    const classes = wrapper?.className.split(" ") ?? [];
    expect(classes).toContain("lg:max-h-[var(--table-max-height,32rem)]");
    expect(classes).not.toContain("max-h-[var(--table-max-height,32rem)]");
  });

  it("keeps the empty state a plain message rather than a card", () => {
    const { container } = render(
      <Table stackBelow="lg">
        <TableHeader>
          <TableRow>
            <TableHead>Ingredient</TableHead>
            <TableHead>Form</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableEmpty colSpan={2}>
            <p>No ingredients match these filters.</p>
          </TableEmpty>
        </TableBody>
      </Table>,
    );

    const cell = screen.getByRole("cell");
    expect(cell).toHaveAttribute("colspan", "2");
    expect(cell).toHaveClass("max-lg:block", "p-8", "text-center");
    expect(cell.className).not.toContain("rounded-lg");
    expect(container.querySelector('[data-slot="table-empty"]')).toHaveClass(
      "max-lg:block",
    );
  });

  it("loads into the same cards the rows will arrive in", () => {
    const { container } = render(
      <Table stackBelow="lg">
        <TableHeader>
          <TableRow>
            <TableHead>Ingredient</TableHead>
            <TableHead>Form</TableHead>
          </TableRow>
        </TableHeader>
        <TableSkeleton columns={2} rows={2} />
      </Table>,
    );

    const body = container.querySelector('[data-slot="table-skeleton"]');
    expect(body).toHaveClass("max-lg:flex", "max-lg:flex-col");
    const rows = container.querySelectorAll(
      '[data-slot="table-skeleton"] > tr',
    );
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toHaveClass("max-lg:rounded-lg", "max-lg:border");
      expect(row).toHaveAttribute("role", "row");
    }
    expect(screen.getAllByRole("cell")).toHaveLength(4);
  });

  it("leaves a table that never stacks exactly as it was", () => {
    const { container } = render(
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Ingredient</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            <TableCell>Cowpea leaves</TableCell>
          </TableRow>
        </TableBody>
      </Table>,
    );

    const table = container.querySelector('[data-slot="table"]');
    expect(table).not.toHaveAttribute("data-stack");
    expect(table).not.toHaveAttribute("role");
    expect(
      container.querySelector('[data-slot="table-container"]'),
    ).toHaveClass("overflow-x-auto");
    expect(container.querySelector('[data-slot="table-body"]')).toHaveClass(
      "[&_tr:last-child]:border-0",
    );

    const cell = screen.getByRole("cell");
    expect(cell).toHaveClass("whitespace-nowrap");
    expect(cell).not.toHaveAttribute("data-label");
    expect(cell.className).not.toContain("max-lg:");
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

  it("still names it missing once the row is a card, and never prints a zero", async () => {
    getIngredientFacets.mockResolvedValue(facets);
    listIngredients.mockResolvedValue(row(null));
    renderWithProviders(<IngredientCatalogue />);

    const cell = await screen.findByRole("cell", { name: NOT_REPORTED });
    expect(cell).toHaveAttribute("data-label", "Protein (g/100 g)");
    expect(cell.textContent).toBe(NOT_REPORTED);
    expect(cell.textContent).not.toMatch(/\d/);

    // The rest of the card must not fill the gap with a zero either.
    const card = cell.closest('[data-slot="table-row"]');
    expect(card).toHaveClass("max-lg:rounded-lg");
    expect(card?.textContent).not.toMatch(/\b0\b/);
  });

  it("labels every value in the card but the ingredient's own name", async () => {
    getIngredientFacets.mockResolvedValue(facets);
    listIngredients.mockResolvedValue(row(23.5));
    renderWithProviders(<IngredientCatalogue />);

    await screen.findByRole("cell", { name: "23.5" });
    expect(
      screen.getAllByRole("cell").map((c) => c.getAttribute("data-label")),
    ).toEqual([null, "Form", "Protein (g/100 g)", "Data", "Source"]);
  });

  it("offers the sort beside the filters, where a card has no header to click", async () => {
    const user = userEvent.setup();
    getIngredientFacets.mockResolvedValue(facets);
    listIngredients.mockResolvedValue(row(23.5));
    renderWithProviders(<IngredientCatalogue />);

    const sort = await screen.findByLabelText("Sort ingredients");
    expect(sort).toHaveClass("lg:hidden");
    expect(sort).toHaveValue("common_name");

    await user.selectOptions(sort, "-protein");
    expect(replace).toHaveBeenCalledWith("/ingredients?sort=-protein", {
      scroll: false,
    });
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
