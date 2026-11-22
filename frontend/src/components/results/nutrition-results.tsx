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
import { AminoAcidScoreChart } from "@/components/results/amino-acid-score-chart";
import { MacroChart } from "@/components/results/macro-chart";
import type { AminoAcidBlock, NutritionResult } from "@/types";

const BASIS_TEXT: Record<string, string> = {
  per_100g_as_formulated: "per 100 g as formulated",
};

/** Calculated nutrition from the backend. Missing values are never shown as 0. */
export function NutritionResults({ result }: { result: NutritionResult }) {
  return (
    <section aria-label="Nutrition results" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-sm font-medium">Nutrition</h2>
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
              <TableCell className="text-right tabular-nums">
                {n.value === null ? (
                  <span className="text-muted-foreground">missing</span>
                ) : (
                  <>
                    {formatNumber(n.value)}{" "}
                    <span className="text-muted-foreground">{n.unit}</span>
                  </>
                )}
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {n.value === null
                  ? `${n.missing_ingredient_ids?.length ?? 0} ingredient(s) have no reported value`
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
      <p className="text-xs text-muted-foreground">
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
    <div className="rounded-lg border p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-medium">Amino acid score</h3>
        <Badge variant="secondary">{block.method}</Badge>
        <Badge variant={block.complete ? "outline" : "destructive"}>
          {block.complete ? "Complete data" : "Incomplete data"}
        </Badge>
      </div>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
        <dt className="text-muted-foreground">Score</dt>
        <dd className="tabular-nums">
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
