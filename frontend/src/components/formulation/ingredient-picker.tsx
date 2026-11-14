"use client";

import { PlusIcon, SearchIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApiQuery } from "@/hooks/use-api-query";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { getIngredient, listIngredients } from "@/lib/api/ingredients";
import { errorMessage, formatNumber, NOT_REPORTED } from "@/lib/format";
import { useFormulationStore } from "@/stores/formulationStore";

/** Searches the real ingredient catalogue and adds the chosen record to the draft. */
export function IngredientPicker({ takenIds }: { takenIds: string[] }) {
  const [text, setText] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);
  const q = useDebouncedValue(text.trim(), 300);
  const enabled = q.length >= 2;

  const { data, error, loading } = useApiQuery(
    `pick|${q}`,
    () => listIngredients({ q, page_size: 8, exclude_animal_groups: true }),
    enabled,
  );

  async function add(id: string) {
    setBusyId(id);
    setAddError(null);
    try {
      const ingredient = await getIngredient(id);
      useFormulationStore.getState().addIngredient(ingredient, 0);
    } catch (e) {
      setAddError(errorMessage(e));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section aria-label="Add ingredient" className="flex flex-col gap-2">
      <div className="relative">
        <SearchIcon
          className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Search ingredients to add (e.g. cowpea)"
          aria-label="Search ingredients"
          className="pl-8"
        />
      </div>
      {!enabled && (
        <p className="text-xs text-muted-foreground">
          Type at least two characters to search the catalogue.
        </p>
      )}
      {enabled && error && (
        <p role="alert" className="text-xs text-destructive">
          {errorMessage(error)}
        </p>
      )}
      {addError && (
        <p role="alert" className="text-xs text-destructive">
          {addError}
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
                      : `${formatNumber(i.protein_g_per_100g)} g/100 g`}{" "}
                    · {i.source.name}
                  </p>
                </div>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={taken || busyId === i.id}
                  onClick={() => void add(i.id)}
                  aria-label={`Add ${i.common_name}`}
                >
                  <PlusIcon aria-hidden /> {taken ? "Added" : "Add"}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
