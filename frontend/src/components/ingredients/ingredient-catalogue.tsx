"use client";

import { cn } from "cn";
import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useApiQuery } from "@/hooks/use-api-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getIngredientFacets, listIngredients } from "@/lib/api/ingredients";
import { errorMessage, formatNumber, NOT_REPORTED } from "@/lib/format";

const PAGE_SIZE = 25;
const SELECT_CLASS =
  "h-8 rounded-lg border bg-background px-2 text-small max-w-52";
/** Ingredient, Form, Protein, Data and Source — the span the empty row needs. */
const COLUMNS = 5;

/** The columns the catalogue can be sorted on, as the backend names them. */
type SortColumn = "common_name" | "protein";

/** The columns the backend actually knows how to sort by. */
type SortKey = "common_name" | "-common_name" | "protein" | "-protein";
const SORTS: readonly SortKey[] = [
  "common_name",
  "-common_name",
  "protein",
  "-protein",
];
type FlagKey = "" | "analytical" | "estimated";

interface CatalogueParams {
  q: string;
  crop: string;
  form: string;
  source: string;
  flag: FlagKey;
  sort: SortKey;
  page: number;
}

const DEFAULTS: CatalogueParams = {
  q: "",
  crop: "",
  form: "",
  source: "",
  flag: "",
  sort: "common_name",
  page: 1,
};

export function readParams(search: string): CatalogueParams {
  const p = new URLSearchParams(search);
  const flag = p.get("flag");
  const sort = p.get("sort");
  const page = Number(p.get("page"));
  return {
    q: p.get("q") ?? "",
    crop: p.get("crop") ?? "",
    form: p.get("form") ?? "",
    source: p.get("source") ?? "",
    flag: flag === "analytical" || flag === "estimated" ? flag : "",
    sort: SORTS.includes(sort as SortKey) ? (sort as SortKey) : DEFAULTS.sort,
    page: Number.isFinite(page) && page > 0 ? Math.floor(page) : 1,
  };
}

export function toQueryString(p: CatalogueParams): string {
  const q = new URLSearchParams();
  if (p.q) q.set("q", p.q);
  if (p.crop) q.set("crop", p.crop);
  if (p.form) q.set("form", p.form);
  if (p.source) q.set("source", p.source);
  if (p.flag) q.set("flag", p.flag);
  if (p.sort !== DEFAULTS.sort) q.set("sort", p.sort);
  if (p.page > 1) q.set("page", String(p.page));
  return q.toString();
}

export function IngredientCatalogue() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const params = useMemo(
    () => readParams(searchParams.toString()),
    [searchParams],
  );
  const [search, setSearch] = useState(params.q);
  const [hideAnimal, setHideAnimal] = useState(true);
  const q = useDebouncedValue(search.trim(), 300);

  /**
   * The address bar is the committed query. The box keeps its own draft while
   * typing (the URL only catches up after the debounce), and adopts the URL
   * whenever it changes underneath us — a shared link on load, or Back.
   */
  const [lastUrlQ, setLastUrlQ] = useState(params.q);
  if (params.q !== lastUrlQ) {
    setLastUrlQ(params.q);
    setSearch(params.q);
  }

  const push = useCallback(
    (patch: Partial<CatalogueParams>) => {
      const qs = toQueryString({ ...params, ...patch });
      router.replace(qs ? `/ingredients?${qs}` : "/ingredients", {
        scroll: false,
      });
    },
    [params, router],
  );

  /** Every filter change restarts on the first page so results stay in view. */
  const filter = useCallback(
    (patch: Partial<CatalogueParams>) => push({ ...patch, page: 1 }),
    [push],
  );

  /** The debounced box settles into the URL, which is what drives the request. */
  useEffect(() => {
    if (q !== params.q) push({ q, page: 1 });
    // `push` already reads the current URL, so only `q` belongs here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  const facets = useApiQuery(["facets"], getIngredientFacets);
  const { data, error, loading } = useApiQuery(
    [
      "ingredients",
      {
        q,
        form: params.form,
        crop: params.crop,
        source: params.source,
        flag: params.flag,
        sort: params.sort,
        page: params.page,
        hideAnimal,
      },
    ],
    () =>
      listIngredients({
        q: q || undefined,
        form: params.form || undefined,
        crop: params.crop || undefined,
        source_id: params.source || undefined,
        flag: params.flag || undefined,
        sort: params.sort,
        page: params.page,
        page_size: PAGE_SIZE,
        exclude_animal_groups: hideAnimal || undefined,
      }),
  );
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  const hasFilters = Boolean(
    q || params.crop || params.form || params.source || params.flag,
  );

  const clearFilters = () => {
    setSearch("");
    push({ ...DEFAULTS });
  };

  /*
   * Sorting is the backend's job and the URL's state, so the header is told
   * what to show and reports back what was asked for. A leading minus is the
   * backend's descending marker.
   */
  const sortDirection = (column: SortColumn): TableSortDirection | null => {
    if (params.sort === column) return "ascending";
    if (params.sort === `-${column}`) return "descending";
    return null;
  };

  const sortColumn = (column: SortColumn, next: TableSortDirection) =>
    filter({ sort: next === "descending" ? `-${column}` : column });

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-h1">Ingredient catalogue</h1>
        <p className="text-small text-muted-foreground">
          Real food composition records with their source. Values not reported
          by the source are shown as “{NOT_REPORTED}”, never as zero. The
          address bar carries the filters, so a view can be shared and restored
          on reload.
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-56 flex-1 sm:max-w-sm">
          <SearchIcon
            className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              push({ page: 1 });
            }}
            placeholder="Search ingredients"
            aria-label="Search ingredients"
            className="pl-8"
          />
        </div>
        <select
          className={SELECT_CLASS}
          aria-label="Filter by form"
          value={params.form}
          onChange={(e) => filter({ form: e.target.value })}
        >
          <option value="">All forms</option>
          {facets.data?.forms.map((f) => (
            <option key={f.value} value={f.value}>
              {f.value} ({f.count})
            </option>
          ))}
        </select>
        <select
          className={SELECT_CLASS}
          aria-label="Filter by crop"
          value={params.crop}
          onChange={(e) => filter({ crop: e.target.value })}
        >
          <option value="">All crops</option>
          {facets.data?.crops.map((c) => (
            <option key={c.value} value={c.value}>
              {c.value} ({c.count})
            </option>
          ))}
        </select>
        <select
          className={SELECT_CLASS}
          aria-label="Filter by data source"
          value={params.source}
          onChange={(e) => filter({ source: e.target.value })}
        >
          <option value="">All sources</option>
          {facets.data?.sources.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.count})
            </option>
          ))}
        </select>
        <select
          className={SELECT_CLASS}
          aria-label="Filter by data quality"
          value={params.flag}
          onChange={(e) => filter({ flag: e.target.value as FlagKey })}
        >
          <option value="">All data</option>
          <option value="analytical">Analytical</option>
          <option value="estimated">Estimated</option>
        </select>
        {/*
         * Sorting lives in the column headers, and below `lg` the rows stack
         * into cards and the headers are no longer on screen (see `stackBelow`
         * in the table primitive). The same sort therefore sits beside the
         * filters at those widths. It writes the one piece of state the headers
         * write — the URL's `sort` — so the two can never disagree.
         */}
        <select
          className={cn(SELECT_CLASS, "lg:hidden")}
          aria-label="Sort ingredients"
          value={params.sort}
          onChange={(e) => filter({ sort: e.target.value as SortKey })}
        >
          <option value="common_name">Ingredient A–Z</option>
          <option value="-common_name">Ingredient Z–A</option>
          <option value="-protein">Protein, high to low</option>
          <option value="protein">Protein, low to high</option>
        </select>
        <label className="flex items-center gap-1.5 text-small">
          <input
            type="checkbox"
            checked={hideAnimal}
            onChange={(e) => {
              setHideAnimal(e.target.checked);
              push({ page: 1 });
            }}
          />
          Hide meat, fish and dairy
        </label>
      </div>

      {error ? (
        <p role="alert" className="text-small text-destructive">
          {errorMessage(error)}
        </p>
      ) : (
        /*
         * The header is rendered through every state, so the columns a filter
         * is working on stay visible while the page loads and when nothing
         * matches. A page of 25 rows is longer than the viewport, so the header
         * is pinned.
         *
         * Five columns of names, badges and source citations need more width
         * than a phone or a portrait tablet has, so below `lg` each record
         * becomes a card of labelled lines instead: the ingredient reads down
         * the page rather than across it, and nothing has to be dragged
         * sideways. Each cell below carries the column name it is labelled
         * with there; the name column carries none, because it becomes the
         * card's first line.
         */
        <Table stickyHeader striped stackBelow="lg">
          <TableHeader>
            <TableRow>
              <TableSortableHead
                direction={sortDirection("common_name")}
                onSortChange={(next) => sortColumn("common_name", next)}
              >
                Ingredient
              </TableSortableHead>
              <TableHead>Form</TableHead>
              <TableSortableHead
                numeric
                direction={sortDirection("protein")}
                onSortChange={(next) => sortColumn("protein", next)}
              >
                Protein (g/100 g)
              </TableSortableHead>
              <TableHead>Data</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          {loading ? (
            <TableSkeleton columns={COLUMNS} />
          ) : (
            <TableBody>
              {data?.items.length === 0 ? (
                <TableEmpty colSpan={COLUMNS}>
                  <p>No ingredients match these filters.</p>
                  {hasFilters && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-3"
                      onClick={clearFilters}
                    >
                      Clear search and filters
                    </Button>
                  )}
                </TableEmpty>
              ) : (
                data?.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="max-w-80 whitespace-normal">
                      <Link
                        href={`/ingredients/${i.id}`}
                        className="font-medium text-primary underline underline-offset-4"
                      >
                        {i.common_name}
                      </Link>
                      {i.scientific_name && (
                        <span className="block text-caption text-muted-foreground italic">
                          {i.scientific_name}
                        </span>
                      )}
                    </TableCell>
                    <TableCell label="Form">{i.form}</TableCell>
                    {/*
                     * A protein value the source never reported is named, not
                     * zeroed: `null` is "not reported", and 0 g/100 g would be
                     * a measurement nobody made. The stacked layout changes
                     * only where the value sits, never what it says.
                     */}
                    <TableCell numeric label="Protein (g/100 g)">
                      {i.protein_g_per_100g === null ? (
                        <span className="text-muted-foreground">
                          {NOT_REPORTED}
                        </span>
                      ) : (
                        formatNumber(i.protein_g_per_100g)
                      )}
                    </TableCell>
                    <TableCell label="Data">
                      <span className="flex flex-wrap gap-1">
                        <Badge variant="outline">{i.quality_flag}</Badge>
                        {i.has_amino_acids && (
                          <Badge variant="secondary">amino acids</Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell
                      label="Source"
                      className="text-caption text-muted-foreground"
                    >
                      {i.source.name}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          )}
        </Table>
      )}

      {data && data.total > data.page_size && (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-between text-small"
        >
          <span className="text-muted-foreground">
            Page {data.page} of {pages} · {data.total} ingredients
          </span>
          <span className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={params.page <= 1}
              onClick={() => push({ page: params.page - 1 })}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={params.page >= pages}
              onClick={() => push({ page: params.page + 1 })}
            >
              Next
            </Button>
          </span>
        </nav>
      )}
    </main>
  );
}
