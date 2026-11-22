"use client";

import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { humanizeKey } from "@/lib/format";
import type { ModelMeta } from "@/types";

/**
 * Model provenance badge for a result: what produced the number, how much data
 * it was trained on and how it scored on held-out data. Always links to the
 * registry so the version on any result is reachable.
 */
export function ModelBadge({ model }: { model: ModelMeta }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <Badge variant="outline">
        {humanizeKey(model.target)} · {humanizeKey(model.algorithm)} v
        {model.version}
      </Badge>
      <span className="text-muted-foreground tabular-nums">
        trained on {model.training_set_size} literature samples
        {model.holdout_metric
          ? ` · holdout ${model.holdout_metric.name.toUpperCase()} ${model.holdout_metric.value}`
          : ""}
      </span>
      <Link
        href="/models"
        className="text-primary underline underline-offset-4"
      >
        Model registry
      </Link>
    </div>
  );
}
