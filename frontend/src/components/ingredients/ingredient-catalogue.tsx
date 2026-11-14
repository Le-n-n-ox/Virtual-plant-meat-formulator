"use client";

import { SearchIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiQuery } from "@/hooks/use-api-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getIngredientFacets, listIngredients } from "@/lib/api/ingredients";
import { errorMessage, formatNumber, NOT_REPORTED } from "@/lib/format";

const PAGE_SIZE = 25;
const SELECT_CLASS =
  "h-8 rounded-lg border bg-background px-2 text-sm max-w-52";

export function IngredientCatalogue() {
  const [search, setSearch] = useState("");
  const [form, setForm] = useState("");
  const [crop, setCrop] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebouncedValue(search.trim(), 300);

  const facets = useApiQuery("facets", getIngredientFacets);
  const { data, error, loading } = useApiQuery(
    `ing|${q}|${form}|${crop}|${page}`,
    () =>
      listIngredients({
        q: q || undefined,
        form: form || undefined,
        crop: crop || undefined,
        page,
        page_size: PAGE_SIZE,
        sort: "common_name",
      }),
  );
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Ingredient catalogue
        </h1>
        <p className="text-sm text-muted-foreground">
          Real food composition records with their source. Values not reported
          by the source are shown as “{NOT_REPORTED}”, never as zero.
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
              setPage(1);
            }}
            placeholder="Search ingredients"
            aria-label="Search ingredients"
            className="pl-8"
          />
        </div>
        <select
          className={SELECT_CLASS}
          aria-label="Filter by form"
          value={form}
          onChange={(e) => {
            setForm(e.target.value);
            setPage(1);
          }}
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
          value={crop}
          onChange={(e) => {
            setCrop(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All crops</option>
          {facets.data?.crops.map((c) => (
            <option key={c.value} value={c.value}>
              {c.value} ({c.count})
            </option>
          ))}
        </select>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : loading ? (
        <Skeleton className="h-64 w-full" />
      ) : data && data.items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No ingredients match these filters.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ingredient</TableHead>
              <TableHead>Form</TableHead>
              <TableHead className="text-right">Protein (g/100 g)</TableHead>
              <TableHead>Data</TableHead>
              <TableHead>Source</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.items.map((i) => (
              <TableRow key={i.id}>
                <TableCell className="max-w-80 whitespace-normal">
                  <Link
                    href={`/ingredients/${i.id}`}
                    className="font-medium text-primary underline-offset-4 hover:underline"
                  >
                    {i.common_name}
                  </Link>
                  {i.scientific_name && (
                    <span className="block text-xs text-muted-foreground italic">
                      {i.scientific_name}
                    </span>
                  )}
                </TableCell>
                <TableCell>{i.form}</TableCell>
                <TableCell className="text-right tabular-nums">
                  {i.protein_g_per_100g === null ? (
                    <span className="text-muted-foreground">
                      {NOT_REPORTED}
                    </span>
                  ) : (
                    formatNumber(i.protein_g_per_100g)
                  )}
                </TableCell>
                <TableCell>
                  <span className="flex flex-wrap gap-1">
                    <Badge variant="outline">{i.quality_flag}</Badge>
                    {i.has_amino_acids && (
                      <Badge variant="secondary">amino acids</Badge>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {i.source.name}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {data && data.total > data.page_size && (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-between text-sm"
        >
          <span className="text-muted-foreground">
            Page {data.page} of {pages} · {data.total} ingredients
          </span>
          <span className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </span>
        </nav>
      )}
    </main>
  );
}
