"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiErrorState } from "@/components/api-error";
import type { IngredientListParams } from "@/lib/api/ingredients";
import { useIngredients } from "@/lib/query/hooks";
import type { IngredientListItem } from "@/types";

const forms = ["raw", "cooked", "soaked", "fermented", "roasted", "flour"];
const pageSize = 25;

function readParam(
  searchParams: ReturnType<typeof useSearchParams>,
  key: string,
): string {
  return searchParams.get(key) ?? "";
}

function formatName(ingredient: IngredientListItem): string {
  return ingredient.variety
    ? `${ingredient.common_name} · ${ingredient.variety}`
    : ingredient.common_name;
}

function formatProtein(value: number | null): string {
  return value === null ? "Not reported" : `${value} g`;
}

function pageCount(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size));
}

function IngredientsLoadingState() {
  return (
    <Card>
      <CardContent className="space-y-4 py-6">
        {Array.from({ length: 6 }, (_, index) => (
          <div className="h-10 animate-pulse rounded bg-muted" key={index} />
        ))}
      </CardContent>
    </Card>
  );
}

function IngredientsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState("");
  const [cropInput, setCropInput] = useState("");
  const [sourceInput, setSourceInput] = useState("");

  const query = useMemo(
    () => ({
      q: readParam(searchParams, "q"),
      crop: readParam(searchParams, "crop"),
      form: readParam(searchParams, "form"),
      source: readParam(searchParams, "source"),
      flag: readParam(searchParams, "flag") as IngredientListParams["flag"],
      sort: readParam(searchParams, "sort") || "common_name",
      page: Number(readParam(searchParams, "page")) || 1,
      page_size: pageSize,
    }),
    [searchParams],
  );

  const { data: result, error, isLoading, refetch } = useIngredients(query);

  const updateQuery = useCallback(
    (updates: Record<string, string | number | undefined>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === undefined || value === "") {
          next.delete(key);
        } else {
          next.set(key, String(value));
        }
      }
      if (
        "q" in updates ||
        "crop" in updates ||
        "form" in updates ||
        "source" in updates ||
        "flag" in updates ||
        "sort" in updates
      ) {
        next.delete("page");
      }
      router.replace(`${pathname}?${next.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (
        searchInput !== query.q ||
        cropInput !== query.crop ||
        sourceInput !== query.source
      ) {
        updateQuery({ q: searchInput, crop: cropInput, source: sourceInput });
      }
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    cropInput,
    query.crop,
    query.q,
    query.source,
    searchInput,
    sourceInput,
    updateQuery,
  ]);

  function clearFilters() {
    router.replace(pathname, { scroll: false });
  }

  const totalPages = pageCount(result?.total ?? 0, pageSize);
  const activeFilterCount = [
    query.crop,
    query.form,
    query.source,
    query.flag,
  ].filter(Boolean).length;
  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 p-6 md:p-8">
      <header className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          Reference data · curated sources
        </p>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">
              Ingredient catalogue
            </h1>
            <p className="mt-1 text-muted-foreground">
              Browse ingredients with their form, source, and data-quality
              status.
            </p>
          </div>
          {result && (
            <p className="text-sm text-muted-foreground">
              {result.total} records
            </p>
          )}
        </div>
      </header>

      <Card>
        <CardContent className="flex flex-col gap-3 pt-4">
          <div className="flex flex-col gap-3 lg:flex-row">
            <label className="relative flex-1">
              <span className="sr-only">Search ingredients</span>
              <Search className="absolute top-2 left-2.5 size-4 text-muted-foreground" />
              <Input
                aria-label="Search ingredients"
                className="pl-8"
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search common or scientific name"
                value={searchInput}
                type="search"
              />
            </label>
            <Input
              aria-label="Filter by crop"
              className="lg:w-48"
              onChange={(event) => setCropInput(event.target.value)}
              placeholder="Crop"
              value={cropInput}
            />
            <Input
              aria-label="Filter by source"
              className="lg:w-48"
              onChange={(event) => setSourceInput(event.target.value)}
              placeholder="Data source"
              value={sourceInput}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SlidersHorizontal className="size-4 text-muted-foreground" />
            <Select
              value={query.form || "all"}
              onValueChange={(value) =>
                updateQuery({
                  form: !value || value === "all" ? undefined : value,
                })
              }
            >
              <SelectTrigger
                aria-label="Filter by ingredient form"
                className="w-36"
              >
                <SelectValue placeholder="All forms" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All forms</SelectItem>
                {forms.map((form) => (
                  <SelectItem key={form} value={form}>
                    {form}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={query.flag || "all"}
              onValueChange={(value) =>
                updateQuery({
                  flag: !value || value === "all" ? undefined : value,
                })
              }
            >
              <SelectTrigger
                aria-label="Filter by data quality"
                className="w-40"
              >
                <SelectValue placeholder="All data" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All data</SelectItem>
                <SelectItem value="analytical">Analytical</SelectItem>
                <SelectItem value="estimated">Estimated</SelectItem>
              </SelectContent>
            </Select>
            {activeFilterCount > 0 && (
              <Button onClick={clearFilters} size="sm" variant="ghost">
                <X /> Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {error ? (
        <ApiErrorState error={error} onRetry={() => void refetch()} />
      ) : isLoading && !result ? (
        <IngredientsLoadingState />
      ) : result?.items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="font-medium">No ingredients match these filters.</p>
            <p className="text-sm text-muted-foreground">
              Try a broader search or clear the active filters.
            </p>
            <Button onClick={clearFilters} variant="outline">
              Clear filters
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <Button
                    className="-ml-2"
                    onClick={() =>
                      updateQuery({
                        sort:
                          query.sort === "common_name"
                            ? "-common_name"
                            : "common_name",
                      })
                    }
                    variant="ghost"
                  >
                    Ingredient
                  </Button>
                </TableHead>
                <TableHead>Form</TableHead>
                <TableHead>Origin</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Protein / 100 g</TableHead>
                <TableHead>Data quality</TableHead>
                <TableHead>Amino acids</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result?.items.map((ingredient) => (
                <TableRow key={ingredient.id}>
                  <TableCell>
                    <Link
                      className="font-medium text-primary hover:underline"
                      href={`/ingredients/${ingredient.id}`}
                    >
                      {formatName(ingredient)}
                    </Link>
                    <p className="text-xs italic text-muted-foreground">
                      {ingredient.scientific_name}
                    </p>
                  </TableCell>
                  <TableCell className="capitalize">
                    {ingredient.form}
                  </TableCell>
                  <TableCell>{ingredient.origin || "Not reported"}</TableCell>
                  <TableCell>{ingredient.source.name}</TableCell>
                  <TableCell>
                    {formatProtein(ingredient.protein_g_per_100g)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        ingredient.quality_flag === "analytical"
                          ? "default"
                          : "secondary"
                      }
                    >
                      {ingredient.quality_flag || "Not reported"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {ingredient.has_amino_acids ? (
                      <Badge variant="outline">Available</Badge>
                    ) : (
                      <span className="text-muted-foreground">
                        Not reported
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t p-4">
            <p className="text-sm text-muted-foreground">
              Page {query.page} of {totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                disabled={query.page <= 1}
                onClick={() => updateQuery({ page: query.page - 1 })}
                variant="outline"
              >
                Previous
              </Button>
              <Button
                disabled={query.page >= totalPages}
                onClick={() => updateQuery({ page: query.page + 1 })}
                variant="outline"
              >
                Next
              </Button>
            </div>
          </div>
        </Card>
      )}
    </main>
  );
}

export default function IngredientsPage() {
  return (
    <Suspense fallback={<IngredientsLoadingState />}>
      <IngredientsPageContent />
    </Suspense>
  );
}
