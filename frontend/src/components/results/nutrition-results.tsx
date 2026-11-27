"use client";

import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatNumber, humanizeKey } from "@/lib/format";
import { displayNutrientValue, nutrientKind } from "@/lib/units";
import { usePreferencesStore } from "@/stores/preferencesStore";
import { AminoAcidScoreChart } from "@/components/results/amino-acid-score-chart";
import { MacroChart } from "@/components/results/macro-chart";
import type { AminoAcidBlock, NutritionResult } from "@/types";

const BASIS_TEXT: Record<string, string> = {
  per_100g_as_formulated: "per 100 g as formulated",
};

/** Calculated nutrition from the backend. Missing values are never shown as 0. */
/**
 * Why a nutrient value is absent. The backend may or may not list which
 * ingredients lacked the value; when it does not, the count is unknown rather
 * than zero, and saying "0 ingredients" about a missing value is worse than
 * saying nothing.
 */
export function describeMissing(ids: string[] | undefined): string {
  if (!ids) return "not reported by the source data";
  if (ids.length === 0) return "not reported";
  return ids.length === 1
    ? "1 ingredient has no reported value"
    : `${ids.length} ingredients have no reported value`;
}

export function NutritionResults({ result }: { result: NutritionResult }) {
  const prefs = usePreferencesStore();
  return (
    <section aria-label="Nutrition results" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-h4">Nutrition</h2>
        <Badge variant="secondary">
          {BASIS_TEXT[result.basis] ?? humanizeKey(result.basis)}
        </Badge>
        <Badge variant="outline">Calculated from source data</Badge>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nutrient</TableHead>
            <TableHead className="text-right">Value</TableHead>
            <TableHead>Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {result.nutrients.map((n) => (
            <TableRow key={n.key}>
              <TableCell>{n.name ?? humanizeKey(n.key)}</TableCell>
              <TableCell className="text-right font-numeric">
                {(() => {
                  const shown = displayNutrientValue(
                    n.value,
                    n.unit,
                    nutrientKind(n.key),
                    prefs,
                  );
                  return shown ? (
                    <>
                      {formatNumber(shown.value)}{" "}
                      <span className="text-muted-foreground">
                        {shown.unit}
                      </span>
                    </>
                  ) : (
                    <span className="text-muted-foreground">missing</span>
                  );
                })()}
              </TableCell>
              <TableCell className="text-caption text-muted-foreground">
                {/*
                 * `missing_ingredient_ids` is optional, so a count of 0 used
                 * to be printed for a value that is itself missing — which
                 * reads as "nothing is missing" about a missing value. With no
                 * list, say only what is known.
                 */}
                {n.value === null
                  ? describeMissing(n.missing_ingredient_ids)
                  : n.contains_estimated
                    ? "includes estimated source values"
                    : ""}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <MacroChart result={result} />
      {result.amino_acids && <AminoAcidSummary block={result.amino_acids} />}
      {result.amino_acids && <AminoAcidScoreChart block={result.amino_acids} />}
      <p className="text-caption text-muted-foreground">
        Calculation {result.calc_version}. Source data:{" "}
        {Object.entries(result.data_versions)
          .map(([k, v]) => `${k} ${v}`)
          .join(", ") || "n/a"}
        .
      </p>
    </section>
  );
}

function AminoAcidSummary({ block }: { block: AminoAcidBlock }) {
  return (
    <div className="rounded-lg border p-3 text-small">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-h4">Amino acid score</h3>
        <Badge variant="secondary">{block.method}</Badge>
        <Badge variant={block.complete ? "outline" : "destructive"}>
          {block.complete ? "Complete data" : "Incomplete data"}
        </Badge>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-caption">
        <dt className="text-muted-foreground">Score</dt>
        <dd className="font-numeric">
          {block.score === null ? "not computable" : formatNumber(block.score)}
        </dd>
        <dt className="text-muted-foreground">Limiting amino acid</dt>
        <dd>
          {block.limiting_amino_acid
            ? humanizeKey(block.limiting_amino_acid)
            : "not determined"}
        </dd>
        <dt className="text-muted-foreground">Reference pattern</dt>
        <dd>{block.reference_pattern.name}</dd>
        {block.missing.length > 0 && (
          <>
            <dt className="text-muted-foreground">Missing</dt>
            <dd>{block.missing.map(humanizeKey).join(", ")}</dd>
          </>
        )}
      </dl>
    </div>
  );
}
