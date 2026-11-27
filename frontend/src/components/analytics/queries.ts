"use client";

import { useApiQuery } from "@/hooks/use-api-query";
import { getIngredientFacets, listIngredients } from "@/lib/api/ingredients";
import { listJobs } from "@/lib/api/jobs";
import { listModels } from "@/lib/api/models";
import type {
  IngredientListItem,
  JobListItem,
  ModelListItem,
  Paged,
} from "@/types";

/**
 * The queries behind the Analytics page (guide §5 pages 3, 14 and 15 are the
 * screens these endpoints already serve; this page only counts what they
 * return).
 *
 * Every hook here is a thin `useApiQuery` with a fixed key, so the stat tiles
 * and the panel that owns the same endpoint share one request through the query
 * cache instead of each fetching it again. Keys start with the resource name, as
 * `lib/query/invalidator.tsx` invalidates a whole resource by prefix.
 */

/**
 * A response paired with the moment it arrived. `useApiQuery` hands back the
 * parsed body and nothing else, and the page has to print a timestamp for its
 * provenance footer, so the time travels inside the cached value: a cached
 * answer then keeps the time it was really fetched instead of borrowing the
 * clock of whichever render happens to read it.
 */
export interface Fetched<T> {
  value: T;
  /** ISO 8601, taken when the response resolved. */
  fetchedAt: string;
}

async function withFetchTime<T>(load: () => Promise<T>): Promise<Fetched<T>> {
  const value = await load();
  return { value, fetchedAt: new Date().toISOString() };
}

/**
 * The backend caps `page_size` at 100 (`app/api/deps.py`), so any panel that
 * needs the records themselves rather than a total gets at most this many and
 * has to say so on screen.
 */
export const PAGE_LIMIT = 100;

export const ENDPOINTS = {
  facets: "GET /api/ingredients/facets",
  ingredients: "GET /api/ingredients",
  analytical: "GET /api/ingredients?flag=analytical",
  jobs: `GET /api/jobs?page_size=${PAGE_LIMIT}`,
  models: `GET /api/models?status=all&page_size=${PAGE_LIMIT}`,
} as const;

/** Crop, form and source record counts, straight from the facets endpoint. */
export function useCatalogueFacets() {
  return useApiQuery(["ingredients", "analytics", "facets"], () =>
    withFetchTime(getIngredientFacets),
  );
}

export interface DataQuality {
  /** Active catalogue records, from the list envelope's `total`. */
  total: number;
  /**
   * Records the catalogue's `flag=analytical` filter matches. The backend
   * matches a record when the record's own quality flag is `analytical` *or* any
   * nutrient value on it carries that flag, so this count and `estimated` below
   * overlap: a record holding one measured and one derived value is in both. The
   * two are therefore reported as two independent counts against `total`, never
   * as two halves of it.
   */
  analytical: number;
  /** Records the catalogue's `flag=estimated` filter matches; see above. */
  estimated: number;
  /** The records actually read for the amino-acid count below. */
  sampleSize: number;
  /** How many of those records have no amino-acid profile recorded. */
  sampleWithoutAminoAcids: number;
  /** True when the one page read covers the whole catalogue. */
  sampleIsWholeCatalogue: boolean;
}

/**
 * Quality counts for the catalogue. The three totals come from the list
 * envelope, so they cover every active record; the amino-acid count has to be
 * tallied from records, and the endpoint hands over at most `PAGE_LIMIT` of
 * them, so it is reported against the number of records actually read.
 */
export function useDataQuality() {
  return useApiQuery(["ingredients", "analytics", "quality"], () =>
    withFetchTime(loadDataQuality),
  );
}

async function loadDataQuality(): Promise<DataQuality> {
  const [all, analytical, estimated, sample] = await Promise.all([
    listIngredients({ page_size: 1 }),
    listIngredients({ flag: "analytical", page_size: 1 }),
    listIngredients({ flag: "estimated", page_size: 1 }),
    listIngredients({ page_size: PAGE_LIMIT }),
  ]);
  const items: IngredientListItem[] = sample.items;
  return {
    total: all.total,
    analytical: analytical.total,
    estimated: estimated.total,
    sampleSize: items.length,
    sampleWithoutAminoAcids: items.filter((i) => !i.has_amino_acids).length,
    sampleIsWholeCatalogue: items.length >= all.total,
  };
}

/**
 * The most recent page of job records. `total` is the full count on file, so
 * the panel can name both the window it bucketed and what it did not see.
 */
export function useJobWindow() {
  return useApiQuery(["jobs", "analytics", { page_size: PAGE_LIMIT }], () =>
    withFetchTime((): Promise<Paged<JobListItem>> =>
      listJobs({ page_size: PAGE_LIMIT }),
    ),
  );
}

/** Every model record, approved or not, so coverage can be read per target. */
export function useModelRegistry() {
  return useApiQuery(
    ["models", "analytics", { status: "all", page_size: PAGE_LIMIT }],
    () =>
      withFetchTime((): Promise<Paged<ModelListItem>> =>
        listModels({ status: "all", page_size: PAGE_LIMIT }),
      ),
  );
}
