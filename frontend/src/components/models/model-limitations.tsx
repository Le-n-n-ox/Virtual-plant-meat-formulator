"use client";

import { TriangleAlertIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import { getModel } from "@/lib/api/models";
import { errorMessage } from "@/lib/format";

/**
 * Limitations notice for the model that produced a result. The registry is the
 * source of truth, so this is fetched by model id rather than trusting the
 * result payload alone.
 */
export function ModelLimitations({ modelId }: { modelId: string }) {
  const { data, error, loading } = useApiQuery(["models", modelId], () =>
    getModel(modelId),
  );

  if (loading) return <Skeleton className="h-12 w-full" />;
  if (error) {
    return (
      <p className="text-xs text-muted-foreground">
        Model limitations could not be loaded ({errorMessage(error)}).
      </p>
    );
  }
  if (!data) return null;

  const items = Array.isArray(data.limitations)
    ? data.limitations
    : data.limitations
      ? [data.limitations]
      : [];
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No limitations were recorded for this model.
      </p>
    );
  }

  return (
    <div className="rounded-lg border border-warning/60 bg-warning/10 p-2 text-xs">
      <p className="flex items-center gap-1 font-medium">
        <TriangleAlertIcon className="size-3.5 text-warning" aria-hidden />
        Model limitations
      </p>
      <ul className="mt-1 list-disc pl-4 text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}
