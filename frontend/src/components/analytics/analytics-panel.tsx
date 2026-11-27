"use client";

import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage, formatDateTime } from "@/lib/format";

export interface AnalyticsPanelProps {
  title: string;
  /** What the panel counts, in the words of the record it counts. */
  description: string;
  /** The endpoint behind the panel, printed verbatim in the footer. */
  source: string;
  /** When the response on screen arrived; null until one has. */
  fetchedAt: string | null;
  loading: boolean;
  error: unknown;
  /** True when the response parsed but carried no records to aggregate. */
  empty?: boolean;
  /** What to say in that case, naming the records that are absent. */
  emptyMessage?: string;
  children?: ReactNode;
}

/**
 * The shell every panel on the Analytics page uses: one card, the three states
 * the pull-request checklist requires (loading, empty, error) and a provenance
 * footer that names the endpoint and the fetch time.
 *
 * The footer is not optional decoration. Section 9 of the frontend guide asks
 * every displayed value to carry its source, and the values here are counts of
 * records returned by a named endpoint at a named moment — a count taken five
 * minutes ago from `/api/jobs` is a different statement from the same count
 * taken now, so the panel says which one the reader is looking at.
 */
export function AnalyticsPanel({
  title,
  description,
  source,
  fetchedAt,
  loading,
  error,
  empty = false,
  emptyMessage = "No records to count yet.",
  children,
}: AnalyticsPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {error ? (
          <p role="alert" className="text-small text-destructive">
            {errorMessage(error)}
          </p>
        ) : loading ? (
          <Skeleton className="h-72 w-full" />
        ) : empty ? (
          <p className="rounded-lg border border-dashed p-8 text-center text-small text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          children
        )}
        <p className="text-caption text-muted-foreground">
          Source: {source} · fetched{" "}
          {fetchedAt ? formatDateTime(fetchedAt) : "not yet"}
        </p>
      </CardContent>
    </Card>
  );
}
