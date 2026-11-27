"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, formatNumber } from "@/lib/format";
import {
  ENDPOINTS,
  useDataQuality,
  useJobWindow,
  useModelRegistry,
} from "./queries";

/**
 * The row of counts at the top of the Analytics page.
 *
 * Each tile is a count of records a named endpoint reported, over a named
 * period, and nothing else. None of them is a nutritional or texture result:
 * "records flagged analytical" counts the catalogue rows the `flag=analytical`
 * filter matches, it makes no claim about what any of those rows contains.
 *
 * The tiles reuse the same query keys as the panels below, so the endpoint
 * behind a tile is fetched once and the tile and its panel can never disagree.
 */
export function StatTiles() {
  const quality = useDataQuality();
  const jobs = useJobWindow();
  const models = useModelRegistry();

  return (
    <section
      aria-label="Record counts"
      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      <StatTile
        label="Catalogue records"
        count={quality.data?.value.total ?? null}
        period="Active records in the catalogue now"
        source={ENDPOINTS.ingredients}
        loading={quality.loading}
        error={quality.error}
      />
      <StatTile
        label="Records flagged analytical"
        count={quality.data?.value.analytical ?? null}
        period="Active records in the catalogue now"
        source={ENDPOINTS.analytical}
        loading={quality.loading}
        error={quality.error}
      />
      <StatTile
        label="Job records"
        count={jobs.data?.value.total ?? null}
        period="Every job on file, all time"
        source={ENDPOINTS.jobs}
        loading={jobs.loading}
        error={jobs.error}
      />
      <StatTile
        label="Model records"
        count={models.data?.value.total ?? null}
        period="Every model version on file, all time"
        source={ENDPOINTS.models}
        loading={models.loading}
        error={models.error}
      />
    </section>
  );
}

function StatTile({
  label,
  count,
  period,
  source,
  loading,
  error,
}: {
  label: string;
  /** null when the endpoint has not answered, never shown as a zero. */
  count: number | null;
  period: string;
  source: string;
  loading: boolean;
  error: unknown;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <p className="text-caption font-medium text-muted-foreground">{label}</p>
      {error ? (
        <p role="alert" className="text-small text-destructive">
          {errorMessage(error)}
        </p>
      ) : loading ? (
        <Skeleton className="h-9 w-24" />
      ) : (
        <p className="text-h1 font-numeric">
          {count === null ? (
            <span className="text-h4 text-muted-foreground">not available</span>
          ) : (
            formatNumber(count)
          )}
        </p>
      )}
      <p className="text-caption text-muted-foreground">{period}</p>
      <p className="font-numeric text-caption text-muted-foreground">
        {source}
      </p>
    </div>
  );
}
