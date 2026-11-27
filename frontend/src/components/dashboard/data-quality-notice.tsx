"use client";

import { TriangleAlertIcon } from "lucide-react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useApiQuery } from "@/hooks/use-api-query";
import { getIngredientFacets, listIngredients } from "@/lib/api/ingredients";
import { formatNumber } from "@/lib/format";

/**
 * Data-quality notice (guide §5 page 2). The catalogue is real food-composition
 * data, so some rows are estimated rather than analytically measured. The notice
 * counts them through the catalogue's own `flag` filter and says so out loud
 * instead of letting an estimated value pass as analytical.
 */
export function DataQualityNotice() {
  const { data: facets } = useApiQuery(["facets"], getIngredientFacets);
  const { data, error, loading } = useApiQuery(
    ["ingredients", { flag: "estimated", page_size: 1 }],
    () => listIngredients({ flag: "estimated", page_size: 1 }),
  );

  // Nothing to say until both queries answer, and nothing flagged is good news.
  if (loading) return <Skeleton className="h-12 w-full" />;
  if (error) return null;
  const estimated = data?.total ?? 0;
  if (estimated === 0) return null;

  const sources = facets?.sources.length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TriangleAlertIcon className="size-4 text-warning" aria-hidden /> Data
          quality
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-small text-muted-foreground">
          <span className="font-medium text-foreground">
            {formatNumber(estimated)}
          </span>{" "}
          catalogue {estimated === 1 ? "record is" : "records are"} flagged as
          estimated rather than analytically measured
          {sources > 0 ? ` across ${formatNumber(sources)} sources` : ""}. Those
          values are labelled where they appear; they are not measurements.
        </p>
        <Link
          href="/ingredients"
          className="mt-2 inline-block text-small text-primary underline underline-offset-4"
        >
          Browse the catalogue and its quality flags
        </Link>
      </CardContent>
    </Card>
  );
}
