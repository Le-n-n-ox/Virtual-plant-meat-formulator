"use client";

import { TargetIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useApiQuery } from "@/hooks/use-api-query";
import { listNutrients } from "@/lib/api/ingredients";

/**
 * Targets panel (guide §5 page 6). The values are saved on the formulation's
 * `targets` field and pre-fill the Optimize tab.
 *
 * `targets` is a numeric record, so the cost ceiling's currency is not stored
 * there — it is a display/run preference held by the caller.
 */
export function TargetsPanel({
  values,
  currency,
  dirty,
  saving,
  error,
  onValue,
  onCurrency,
  onSave,
}: {
  values: Record<string, string>;
  currency: string;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  onValue: (key: string, value: string) => void;
  onCurrency: (value: string) => void;
  onSave: () => void;
}) {
  const nutrients = useApiQuery(["nutrients"], listNutrients);
  const list = Array.isArray(nutrients.data)
    ? nutrients.data
    : (nutrients.data?.items ?? []);
  const aminoAcids = list.filter((n) => n.kind === "amino_acid");

  return (
    <section
      aria-label="Targets"
      className="flex flex-col gap-3 rounded-lg border p-3"
    >
      <div>
        <h2 className="text-sm font-medium">Targets</h2>
        <p className="text-xs text-muted-foreground">
          Saved with the formulation and used as the starting point on the
          Optimize tab.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="target-protein">Protein (g per 100 g)</Label>
          <Input
            id="target-protein"
            type="number"
            min={0}
            step="any"
            value={values.protein_g_per_100g ?? ""}
            onChange={(e) => onValue("protein_g_per_100g", e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="target-cost">Cost ceiling (per kg)</Label>
          <div className="flex gap-2">
            <Input
              id="target-cost"
              type="number"
              min={0}
              step="any"
              value={values.cost_ceiling ?? ""}
              onChange={(e) => onValue("cost_ceiling", e.target.value)}
            />
            <Input
              aria-label="Cost currency"
              value={currency}
              maxLength={3}
              onChange={(e) => onCurrency(e.target.value)}
              className="w-20"
            />
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Key amino acids (mg per g protein)</Label>
        {nutrients.error ? (
          <p className="text-xs text-muted-foreground">
            Could not load the amino acid list.
          </p>
        ) : aminoAcids.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No amino acids are defined.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {aminoAcids.map((n) => (
              <div key={n.key} className="flex items-center gap-2">
                <Label htmlFor={`target-${n.key}`} className="flex-1 text-xs">
                  {n.name}
                </Label>
                <Input
                  id={`target-${n.key}`}
                  type="number"
                  min={0}
                  step="any"
                  className="h-7 w-24 tabular-nums"
                  value={values[n.key] ?? ""}
                  onChange={(e) => onValue(n.key, e.target.value)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div>
        <Button
          size="sm"
          variant="outline"
          disabled={!dirty || saving}
          onClick={onSave}
        >
          <TargetIcon aria-hidden /> Save targets
        </Button>
      </div>
    </section>
  );
}
