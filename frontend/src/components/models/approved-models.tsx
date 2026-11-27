"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import { listModels } from "@/lib/api/models";
import { tokenStore } from "@/lib/api/token";
import {
  errorMessage,
  formatDateTime,
  formatNumber,
  humanizeKey,
} from "@/lib/format";

/**
 * Live list of approved texture models, read from the API. The methodology
 * page is public, so when there is no session the table is replaced by a
 * sign-in prompt instead of a failed request.
 */
export function ApprovedModels() {
  // Subscribe rather than read once, so signing in or out updates the page.
  const hasToken = useSyncExternalStore(
    tokenStore.subscribe,
    () => Boolean(tokenStore.get()),
    () => false,
  );

  const { data, error, loading } = useApiQuery(
    ["models", { status: "approved", page_size: 100 }],
    () => listModels({ status: "approved", page_size: 100 }),
    hasToken,
  );

  if (!hasToken) {
    return (
      <p className="text-small text-muted-foreground">
        Sign in to see the currently approved models.{" "}
        <Link
          href="/login"
          className="text-primary underline underline-offset-4"
        >
          Sign in
        </Link>
      </p>
    );
  }
  if (loading) return <Skeleton className="h-24 w-full" />;
  if (error)
    return (
      <p role="alert" className="text-small text-destructive">
        {errorMessage(error)}
      </p>
    );
  if (!data || data.items.length === 0)
    return (
      <p className="text-small text-muted-foreground">
        No texture model is approved yet, so texture predictions are
        unavailable.
      </p>
    );
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full min-w-[520px] text-small">
        <thead className="bg-muted/40 text-left text-caption text-muted-foreground">
          <tr>
            <th className="p-2 font-medium">Target</th>
            <th className="p-2 font-medium">Algorithm</th>
            <th className="p-2 font-medium">Version</th>
            <th className="p-2 text-right font-medium">Holdout error</th>
            <th className="p-2 text-right font-medium">Training size</th>
            <th className="p-2 font-medium">Approved</th>
          </tr>
        </thead>
        <tbody>
          {data.items.map((m) => (
            <tr key={m.id} className="border-t">
              <td className="p-2 font-medium">{humanizeKey(m.target)}</td>
              <td className="p-2">{humanizeKey(m.algorithm)}</td>
              <td className="p-2">v{m.version}</td>
              <td className="p-2 text-right font-numeric">
                {m.holdout_metric
                  ? `${m.holdout_metric.name.toUpperCase()} ${formatNumber(m.holdout_metric.value)}${m.unit ? ` ${m.unit}` : ""}`
                  : "not reported"}
              </td>
              <td className="p-2 text-right font-numeric">
                {m.training_set_size} samples
              </td>
              <td className="p-2">{formatDateTime(m.approved_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="border-t p-2 text-caption text-muted-foreground">
        Details and limitations of each model are on the{" "}
        <Link
          href="/models"
          className="text-primary underline underline-offset-4"
        >
          Models page
        </Link>
        .
      </p>
    </div>
  );
}
