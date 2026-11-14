"use client";

import { PlusIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApiQuery } from "@/hooks/use-api-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { listIngredients } from "@/lib/api/ingredients";
import { errorMessage, formatNumber, NOT_REPORTED } from "@/lib/format";
import type { IngredientListItem } from "@/types";

/**
 * Searches the real ingredient catalogue and reports the chosen record.
 * Unlike the editor's picker it does not touch the formulation draft.
 */
export function CatalogueSearch({
  takenIds,
  onPick,
  label = "Search ingredients",
}: {
  takenIds: string[];
  onPick: (ingredient: IngredientListItem) => void;
  label?: string;
}) {
  const [text, setText] = useState("");
  const q = useDebouncedValue(text.trim(), 300);
  const enabled = q.length >= 2;
  const { data, error, loading } = useApiQuery(
    `cat-search|${q}`,
    () => listIngredients({ q, page_size: 8 }),
    enabled,
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="relative">
        <SearchIcon
          className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={`${label} (at least two characters)`}
          aria-label={label}
          className="pl-8"
        />
      </div>
      {enabled && error && (
        <p role="alert" className="text-xs text-destructive">
          {errorMessage(error)}
        </p>
      )}
      {enabled && loading && (
        <p className="text-xs text-muted-foreground">Searching…</p>
      )}
      {enabled && data && data.items.length === 0 && (
        <p className="text-xs text-muted-foreground">No ingredients found.</p>
      )}
      {enabled && data && data.items.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {data.items.map((i) => {
            const taken = takenIds.includes(i.id);
            return (
              <li
                key={i.id}
                className="flex items-center justify-between gap-2 px-2.5 py-1.5"
              >
                <div className="min-w-0 text-sm">
                  <p className="truncate font-medium">{i.common_name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {i.form} · protein{" "}
                    {i.protein_g_per_100g === null
                      ? NOT_REPORTED
                      : `${formatNumber(i.protein_g_per_100g)} g/100 g`}
                  </p>
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={taken}
                  onClick={() => onPick(i)}
                  aria-label={`Add ${i.common_name}`}
                >
                  <PlusIcon aria-hidden /> {taken ? "Added" : "Add"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
