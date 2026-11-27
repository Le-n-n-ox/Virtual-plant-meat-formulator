"use client";

import { cva } from "class-variance-authority";
import { cn } from "cn";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/*
 * The data tables — the ingredient catalogue, the formulation and job lists,
 * candidates, versions and the result tables — are the app's primary surface
 * for scientific values, so they have to read as one system rather than as six
 * tables that each solved alignment and padding by hand. The tokens for that
 * system live here, next to the elements they style, because `globals.css` owns
 * colour and type and has no table layer: `density` is the row rhythm, `align`
 * is the column alignment, and `numeric` is the one marker for a figure that is
 * compared down a column.
 *
 * Everything added beyond the plain wrapper is opt-in and defaults to the
 * behaviour the existing call sites already had, so a table that passes no new
 * props renders exactly as before.
 *
 * `density`, `striped`, `stickyHeader` and `stackBelow` are configured once on
 * `Table` and reach the cells through context rather than through a descendant
 * selector such as `[&_td]:p-1`. A descendant selector outranks the utility on
 * the cell itself, which would make a call site's own `className` stop working;
 * context puts every class on the element, where `cn()` resolves the conflict
 * in favour of the call site. Note that context only crosses a client
 * boundary, so a server component that renders `<Table>` would get the
 * defaults — every call site today is a client component.
 *
 * `stackBelow` is the one option that changes the layout rather than the trim,
 * and it is what makes a wide scientific table readable on a phone. Below its
 * breakpoint the table stops being a grid: every row becomes a card and every
 * cell becomes a line of label and value, so the whole of one record is on
 * screen at once and nothing has to be dragged sideways to be read. See the
 * comment on `STACKED` for why that beats hiding the secondary columns or
 * freezing the first one.
 */

type TableDensity = "comfortable" | "compact";
type TableAlign = "start" | "center" | "end";
type TableSortDirection = "ascending" | "descending";
/** The width from which a stacked table is a table again. */
type TableStackBreakpoint = "sm" | "md" | "lg";

interface TableContextValue {
  density: TableDensity;
  striped: boolean;
  stickyHeader: boolean;
  stackBelow?: TableStackBreakpoint;
}

const TableContext = React.createContext<TableContextValue>({
  density: "comfortable",
  striped: false,
  stickyHeader: false,
});

/*
 * The stacked layout, one slot at a time.
 *
 * Why stacked cards and not the two alternatives. Hiding the secondary columns
 * behind a disclosure would put protein, data quality and source — the reasons
 * a scientist opens the catalogue at all — one tap away per row, so scanning a
 * page of 25 records would cost 25 taps. Freezing the ingredient column and
 * scrolling the rest keeps exactly the sideways dragging this is meant to
 * remove, and a frozen column also has to fight the stripes and the sticky
 * header for its background. A card per row needs no interaction, hides
 * nothing, and reads like the record it is: the ingredient name on the first
 * line, then one labelled line per value with its unit, flag and source.
 *
 * The labels come from each cell's own `data-label` through `::before` rather
 * than from a span in the cell. The column name is a label, not content: as
 * generated content it is announced in the stacked layout (where the header row
 * is gone) and disappears with the rule that draws it once the header row is
 * back, and it never becomes part of the cell's text, which a test or a copied
 * selection would otherwise pick up as part of the value.
 *
 * Every class is spelled out per breakpoint because Tailwind only sees class
 * names as written: a template such as `max-${breakpoint}:block` compiles to
 * nothing at all. Keeping them in one table is also the only way to read the
 * layout as a layout.
 */
interface TableStackClasses {
  /** The horizontal scrollport, which is only needed once this is a table again. */
  container: string;
  /** The sticky header's scroll window, for the same reason. */
  stickyWindow: string;
  /** Blocks, so the rows can become cards instead of a grid. */
  table: string;
  /** The column names move into the cells, so the header row has nothing to show. */
  header: string;
  body: string;
  row: string;
  /** The hairline between rows, which the card's own border replaces while stacked. */
  lastRow: string;
  /** A cell with a `label`: the label and the value share one line. */
  labelledCell: string;
  /** The label itself, drawn from `data-label`. */
  label: string;
  /** A cell with no `label`: the identifying value, on the card's first line. */
  titleCell: string;
  /** A cell that stands in for a whole row: the empty state and the loading rows. */
  spanningCell: string;
}

const STACKED: Record<TableStackBreakpoint, TableStackClasses> = {
  sm: {
    container: "sm:overflow-x-auto",
    stickyWindow:
      "sm:max-h-[var(--table-max-height,32rem)] sm:overflow-y-auto sm:overscroll-contain",
    table: "max-sm:block",
    header: "max-sm:hidden",
    body: "max-sm:flex max-sm:flex-col max-sm:gap-3",
    row: "max-sm:block max-sm:rounded-lg max-sm:border max-sm:p-3",
    lastRow: "sm:[&_tr:last-child]:border-0",
    labelledCell:
      "max-sm:flex max-sm:items-baseline max-sm:justify-between max-sm:gap-4 max-sm:px-0 max-sm:py-1 max-sm:whitespace-normal max-sm:break-words",
    label:
      "max-sm:before:font-sans max-sm:before:text-caption max-sm:before:font-normal max-sm:before:text-muted-foreground max-sm:before:content-[attr(data-label)]",
    titleCell:
      "max-sm:block max-sm:px-0 max-sm:pt-0 max-sm:pb-2 max-sm:text-body max-sm:whitespace-normal max-sm:break-words",
    spanningCell: "max-sm:block",
  },
  md: {
    container: "md:overflow-x-auto",
    stickyWindow:
      "md:max-h-[var(--table-max-height,32rem)] md:overflow-y-auto md:overscroll-contain",
    table: "max-md:block",
    header: "max-md:hidden",
    body: "max-md:flex max-md:flex-col max-md:gap-3",
    row: "max-md:block max-md:rounded-lg max-md:border max-md:p-3",
    lastRow: "md:[&_tr:last-child]:border-0",
    labelledCell:
      "max-md:flex max-md:items-baseline max-md:justify-between max-md:gap-4 max-md:px-0 max-md:py-1 max-md:whitespace-normal max-md:break-words",
    label:
      "max-md:before:font-sans max-md:before:text-caption max-md:before:font-normal max-md:before:text-muted-foreground max-md:before:content-[attr(data-label)]",
    titleCell:
      "max-md:block max-md:px-0 max-md:pt-0 max-md:pb-2 max-md:text-body max-md:whitespace-normal max-md:break-words",
    spanningCell: "max-md:block",
  },
  lg: {
    container: "lg:overflow-x-auto",
    stickyWindow:
      "lg:max-h-[var(--table-max-height,32rem)] lg:overflow-y-auto lg:overscroll-contain",
    table: "max-lg:block",
    header: "max-lg:hidden",
    body: "max-lg:flex max-lg:flex-col max-lg:gap-3",
    row: "max-lg:block max-lg:rounded-lg max-lg:border max-lg:p-3",
    lastRow: "lg:[&_tr:last-child]:border-0",
    labelledCell:
      "max-lg:flex max-lg:items-baseline max-lg:justify-between max-lg:gap-4 max-lg:px-0 max-lg:py-1 max-lg:whitespace-normal max-lg:break-words",
    label:
      "max-lg:before:font-sans max-lg:before:text-caption max-lg:before:font-normal max-lg:before:text-muted-foreground max-lg:before:content-[attr(data-label)]",
    titleCell:
      "max-lg:block max-lg:px-0 max-lg:pt-0 max-lg:pb-2 max-lg:text-body max-lg:whitespace-normal max-lg:break-words",
    spanningCell: "max-lg:block",
  },
};

/*
 * `display: block` takes a table out of the accessibility tree: the rows and
 * cells become generic boxes and a screen reader stops announcing the grid. The
 * fix is to restate the roles the elements already had, which is why a stacked
 * table carries them and a plain one does not need to. The column headers are
 * genuinely gone below the breakpoint, and the per-cell labels are what replace
 * them.
 */
function useStack(): {
  stackBelow?: TableStackBreakpoint;
  stacked?: TableStackClasses;
} {
  const { stackBelow } = React.useContext(TableContext);
  return { stackBelow, stacked: stackBelow ? STACKED[stackBelow] : undefined };
}

/**
 * Striping is scoped to a body rather than read from the table context
 * directly, so that the header and footer rows never pick up a stripe.
 */
const TableStripeContext = React.createContext(false);

function Table({
  className,
  density = "comfortable",
  striped = false,
  stickyHeader = false,
  stackBelow,
  ...props
}: React.ComponentProps<"table"> & {
  /** Row rhythm for every cell in the table. */
  density?: TableDensity;
  /** Tints alternate body rows. Off by default: a short table reads better plain. */
  striped?: boolean;
  /** Pins the header while the rows scroll. See the comment on the container. */
  stickyHeader?: boolean;
  /**
   * Below this breakpoint each row becomes a card of labelled lines instead of
   * a grid row, so a wide table needs no sideways scrolling on a phone. Give
   * every cell but the identifying one a `label`. Unset by default, which is
   * the plain scrolling table every existing call site already had.
   */
  stackBelow?: TableStackBreakpoint;
}) {
  const context = React.useMemo(
    () => ({ density, striped, stickyHeader, stackBelow }),
    [density, striped, stickyHeader, stackBelow],
  );
  const stacked = stackBelow ? STACKED[stackBelow] : undefined;

  return (
    <TableContext.Provider value={context}>
      <div
        data-slot="table-container"
        /*
         * `overflow-x-auto` already makes this div the table's scrollport in
         * both axes (CSS promotes `overflow-y` to `auto` alongside it), so a
         * sticky header sticks against this element and not against the page.
         * It therefore only looks sticky once the div has a height to scroll
         * within, which is what the max-height adds. A long table that wants a
         * different window sets `--table-max-height` on any ancestor.
         *
         * A stacked table has neither below its breakpoint: there is nothing
         * wider than the screen left to scroll to, the pinned header is not on
         * screen to pin, and an inner 32rem scroll region inside the page's own
         * scroll is the worst thing to hand a phone. Both are therefore applied
         * from the breakpoint up rather than overridden below it, so the
         * cascade never has to choose between two rules.
         */
        className={cn(
          "relative w-full",
          stacked ? stacked.container : "overflow-x-auto",
          stickyHeader &&
            (stacked
              ? stacked.stickyWindow
              : "max-h-[var(--table-max-height,32rem)] overflow-y-auto overscroll-contain"),
        )}
      >
        <table
          data-slot="table"
          data-density={density}
          data-stack={stackBelow}
          role={stackBelow && "table"}
          className={cn(
            "w-full caption-bottom text-small",
            stacked?.table,
            className,
          )}
          {...props}
        />
      </div>
    </TableContext.Provider>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  const { stickyHeader } = React.useContext(TableContext);
  const { stackBelow, stacked } = useStack();

  return (
    <thead
      data-slot="table-header"
      role={stackBelow && "rowgroup"}
      /*
       * The `th` cells stick, not the `thead`: sticky positioning on a table
       * section is the newer behaviour and the cells work in every engine the
       * app supports. The row's bottom border would scroll away with the row,
       * so the hairline moves onto the cells too, and the cells need an opaque
       * background or the body shows through them. A table on a tinted surface
       * overrides that background through this component's `className`.
       */
      className={cn(
        "[&_tr]:border-b",
        stickyHeader &&
          "[&_tr]:border-b-0 [&_th]:sticky [&_th]:top-0 [&_th]:z-10 [&_th]:border-b [&_th]:bg-background",
        stacked?.header,
        className,
      )}
      {...props}
    />
  );
}

function TableBody({
  className,
  striped,
  ...props
}: React.ComponentProps<"tbody"> & {
  /** Overrides the table's own `striped` for this body alone. */
  striped?: boolean;
}) {
  const table = React.useContext(TableContext);
  const { stackBelow, stacked } = useStack();

  return (
    <TableStripeContext.Provider value={striped ?? table.striped}>
      <tbody
        data-slot="table-body"
        role={stackBelow && "rowgroup"}
        /*
         * The last row drops the hairline that separates it from the row below
         * because there is no row below it. A stacked row is a card with a
         * border on all four sides, so the last card would lose its bottom
         * edge; the rule therefore waits for the breakpoint that brings the
         * rows back.
         */
        className={cn(
          stacked ? stacked.lastRow : "[&_tr:last-child]:border-0",
          stacked?.body,
          className,
        )}
        {...props}
      />
    </TableStripeContext.Provider>
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className,
      )}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  const striped = React.useContext(TableStripeContext);
  const { stackBelow, stacked } = useStack();

  return (
    <tr
      data-slot="table-row"
      data-striped={striped || undefined}
      role={stackBelow && "row"}
      /*
       * The stripe is a class on the row rather than an `[&_tr:nth-child(even)]`
       * rule on the body, because the descendant form would outrank the row's
       * own `hover:` class and a striped row would stop responding to the
       * pointer. Here both are plain variants on one element and Tailwind emits
       * `hover` after `even`, so hovering still wins.
       */
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        striped && "even:bg-muted/30",
        stacked?.row,
        className,
      )}
      {...props}
    />
  );
}

/*
 * `numeric` is the marker for a figure that is read against the figures above
 * and below it: it right-aligns the column and sets the `font-numeric` face so
 * the digits share one advance width. It is deliberately the same decision for
 * the header and the cells, so a column's label sits in the same face and on
 * the same edge as its values. A column that only needs an edge — a trailing
 * actions column, a right-aligned label — asks for `align="end"` instead, which
 * is why `align` is declared after `numeric` and overrides the alignment it
 * implies.
 */
const tableHeadVariants = cva(
  "text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0",
  {
    variants: {
      density: {
        comfortable: "h-10 px-2",
        compact: "h-8 px-2",
      },
      numeric: {
        true: "text-right font-numeric",
        false: "",
      },
      align: {
        start: "text-left",
        center: "text-center",
        end: "text-right",
      },
    },
    defaultVariants: {
      density: "comfortable",
      numeric: false,
    },
  },
);

const tableCellVariants = cva(
  "align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0",
  {
    variants: {
      density: {
        comfortable: "p-2",
        compact: "px-2 py-1",
      },
      numeric: {
        true: "text-right font-numeric",
        false: "",
      },
      align: {
        start: "text-left",
        center: "text-center",
        end: "text-right",
      },
    },
    defaultVariants: {
      density: "comfortable",
      numeric: false,
    },
  },
);

/**
 * `align` shadows the deprecated HTML `align` attribute that React still types
 * on `th` and `td`; nothing in the app used it, and the token is the better
 * spelling for a design system.
 */
type TableCellAlignment = {
  numeric?: boolean;
  align?: TableAlign;
};

function TableHead({
  className,
  numeric = false,
  align,
  ...props
}: Omit<React.ComponentProps<"th">, "align"> & TableCellAlignment) {
  const { density } = React.useContext(TableContext);
  const { stackBelow } = useStack();

  return (
    <th
      data-slot="table-head"
      data-numeric={numeric || undefined}
      role={stackBelow && "columnheader"}
      className={cn(tableHeadVariants({ density, numeric, align }), className)}
      {...props}
    />
  );
}

function TableCell({
  className,
  numeric = false,
  align,
  label,
  ...props
}: Omit<React.ComponentProps<"td">, "align"> &
  TableCellAlignment & {
    /**
     * The cell's column name, for a table that stacks. It is drawn beside the
     * value once the header row is off screen, and it should repeat the column
     * header word for word, units and all. Leave it off the identifying column
     * — the ingredient's name — which becomes the card's first line instead.
     */
    label?: string;
  }) {
  const { density } = React.useContext(TableContext);
  const { stackBelow, stacked } = useStack();

  return (
    <td
      data-slot="table-cell"
      data-numeric={numeric || undefined}
      data-label={label}
      role={stackBelow && "cell"}
      className={cn(
        tableCellVariants({ density, numeric, align }),
        label === undefined ? stacked?.titleCell : stacked?.labelledCell,
        label !== undefined && stacked?.label,
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({
  className,
  ...props
}: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-small text-muted-foreground", className)}
      {...props}
    />
  );
}

/**
 * A sortable column header. It holds no sorting logic of its own on purpose:
 * the catalogue sorts server-side and keeps the sort in the URL, so this takes
 * the direction it should display and reports the direction the user asked for.
 * `aria-sort` goes on the `th` because that is the cell the state belongs to,
 * and the button inside it is what takes focus and the click.
 *
 * A table that stacks has no header row below its breakpoint, so this control
 * is not on screen there: that table has to offer the same sort beside its
 * filters, writing the same state. The catalogue does exactly that.
 */
function TableSortableHead({
  className,
  direction = null,
  onSortChange,
  label,
  numeric = false,
  align,
  children,
  ...props
}: Omit<React.ComponentProps<"th">, "align" | "aria-sort"> &
  TableCellAlignment & {
    /** The direction this column is sorted in, or null when another column owns the sort. */
    direction?: TableSortDirection | null;
    /** Called with the direction a click is asking for. */
    onSortChange: (next: TableSortDirection) => void;
    /** Accessible name for the column when `children` is not plain text. */
    label?: string;
  }) {
  const next: TableSortDirection =
    direction === "ascending" ? "descending" : "ascending";
  const name = label ?? (typeof children === "string" ? children : undefined);
  /*
   * The indicator is never the only cue. The button is named for the action it
   * performs, the `th` carries `aria-sort`, and `aria-pressed` marks the column
   * that currently owns the sort for a reader that reaches the button without
   * its header. The neutral glyph on the unsorted columns is what tells the eye
   * that they can be sorted at all.
   */
  const Indicator =
    direction === "ascending"
      ? ArrowUp
      : direction === "descending"
        ? ArrowDown
        : ArrowUpDown;

  return (
    <TableHead
      aria-sort={direction ?? "none"}
      numeric={numeric}
      align={align}
      className={className}
      {...props}
    >
      <Button
        variant="ghost"
        size="sm"
        /*
         * The negative margin cancels the button's own padding against the
         * cell's, so the header label sits on the same edge as the values
         * below it while the hover and focus shapes still fill the cell.
         * Focus is a solid `border-ring` from `buttonVariants`, which clears
         * the 3:1 contrast minimum in every theme; a ring alone does not.
         */
        className="-mx-2 px-2 font-medium"
        aria-label={name && `Sort by ${name}`}
        aria-pressed={direction !== null}
        onClick={() => onSortChange(next)}
      >
        {children}
        <Indicator
          className={cn("size-3.5", direction === null && "opacity-50")}
          aria-hidden
        />
      </Button>
    </TableHead>
  );
}

/**
 * The "no results" row. It stays inside the table so the column headers survive
 * a filter that matches nothing — the user needs to see which columns they were
 * filtering. `colSpan` is required because a wrong span silently breaks the
 * table's layout. Children are free-form: most states want a sentence plus the
 * action that clears the filters.
 */
function TableEmpty({
  className,
  colSpan,
  children,
  ...props
}: React.ComponentProps<"td"> & { colSpan: number }) {
  const { stackBelow, stacked } = useStack();

  return (
    <tr
      data-slot="table-empty"
      role={stackBelow && "row"}
      className={stacked?.spanningCell}
    >
      <td
        colSpan={colSpan}
        role={stackBelow && "cell"}
        /*
         * The message is not a record, so it stays a plain centred paragraph
         * rather than becoming one of the cards around it.
         */
        className={cn(
          "p-8 text-center text-small text-muted-foreground",
          stacked?.spanningCell,
          className,
        )}
        {...props}
      >
        {children}
      </td>
    </tr>
  );
}

/**
 * Placeholder rows for a table that is still loading. It replaces the `TableBody`
 * rather than the whole table, so the header stays put and the rows arrive
 * without the page jumping.
 */
function TableSkeleton({
  className,
  columns,
  rows = 5,
  ...props
}: React.ComponentProps<"tbody"> & {
  columns: number;
  rows?: number;
}) {
  const { density } = React.useContext(TableContext);
  const { stackBelow, stacked } = useStack();

  return (
    <tbody
      data-slot="table-skeleton"
      aria-busy="true"
      role={stackBelow && "rowgroup"}
      className={cn(
        stacked ? stacked.lastRow : "[&_tr:last-child]:border-0",
        stacked?.body,
        className,
      )}
      {...props}
    >
      {/*
       * The placeholder rows take the same shape as the real ones, cards
       * included, so the loading state is the size and rhythm of what is
       * about to replace it rather than a grid that reflows on arrival.
       */}
      {Array.from({ length: rows }, (_, row) => (
        <tr
          key={row}
          role={stackBelow && "row"}
          className={cn("border-b", stacked?.row)}
        >
          {Array.from({ length: columns }, (_, column) => (
            <td
              key={column}
              role={stackBelow && "cell"}
              className={cn(
                tableCellVariants({ density }),
                stacked?.spanningCell,
              )}
            >
              <Skeleton className="h-4 w-full" />
            </td>
          ))}
        </tr>
      ))}
    </tbody>
  );
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
  TableEmpty,
  TableSkeleton,
  TableSortableHead,
  tableCellVariants,
  tableHeadVariants,
};
export type {
  TableAlign,
  TableDensity,
  TableSortDirection,
  TableStackBreakpoint,
};
