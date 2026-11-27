"use client";

import { ArrowLeftIcon } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiQuery } from "@/hooks/use-api-query";
import { AminoAcidChart } from "@/components/ingredients/amino-acid-chart";
import { AddToFormulation } from "@/components/ingredients/add-to-formulation";
import { getIngredient } from "@/lib/api/ingredients";
import {
  errorMessage,
  formatNumber,
  humanizeKey,
  NOT_REPORTED,
} from "@/lib/format";
import {
  displayNutrientValue,
  nutrientKind,
  type NutrientKind,
} from "@/lib/units";
import { usePreferencesStore } from "@/stores/preferencesStore";
import type { NutrientValue } from "@/types";

const KFCT_NOTE = "Non-commercial research use with acknowledgement";

function ValueTable({
  title,
  rows,
  empty,
  kindOf,
}: {
  title: string;
  rows: NutrientValue[];
  empty: string;
  /** Classify each row so the right display unit applies. */
  kindOf: (row: NutrientValue) => NutrientKind;
}) {
  const prefs = usePreferencesStore();
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-small text-muted-foreground">{empty}</p>
        ) : (
          /*
           * Four columns of nutrient names, values with units, ranges and
           * quality flags do not fit a phone, so below `md` each nutrient
           * becomes a card of labelled lines: the name on the first line, then
           * its value, its range and its flag, each one named. From `md` up it
           * is the same table as before.
           */
          <Table stackBelow="md">
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead numeric>Value</TableHead>
                <TableHead>Range</TableHead>
                <TableHead>Quality</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((n) => (
                <TableRow key={n.key}>
                  <TableCell>{n.name ?? humanizeKey(n.key)}</TableCell>
                  <TableCell numeric label="Value">
                    {(() => {
                      const shown = displayNutrientValue(
                        n.value,
                        n.unit,
                        kindOf(n),
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
                        <span className="text-muted-foreground">
                          {NOT_REPORTED}
                        </span>
                      );
                    })()}
                  </TableCell>
                  <TableCell
                    label="Range"
                    className="text-caption text-muted-foreground font-numeric"
                  >
                    {n.range
                      ? `${formatNumber(n.range[0])}–${formatNumber(n.range[1])}`
                      : "—"}
                  </TableCell>
                  <TableCell
                    label="Quality"
                    className="text-caption text-muted-foreground"
                  >
                    {n.flag}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

export function IngredientDetailView() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading } = useApiQuery(["ingredients", id], () =>
    getIngredient(id),
  );

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <Link
        href="/ingredients"
        className="flex w-fit items-center gap-1 text-small text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" aria-hidden /> Ingredient catalogue
      </Link>
      {error ? (
        <p role="alert" className="text-small text-destructive">
          {errorMessage(error)}
        </p>
      ) : loading || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <header className="flex flex-col gap-2">
            <h1 className="text-h1">{data.common_name}</h1>
            {data.scientific_name && (
              <p className="text-small text-muted-foreground italic">
                {data.scientific_name}
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              <Badge variant="secondary">{data.form}</Badge>
              {data.crop && <Badge variant="outline">{data.crop}</Badge>}
              {data.food_group && (
                <Badge variant="outline">{data.food_group}</Badge>
              )}
              <Badge variant="outline">basis: {data.moisture_basis}</Badge>
              {data.quality_flag && (
                <Badge variant="outline">{data.quality_flag}</Badge>
              )}
            </div>
            <p className="text-caption text-muted-foreground">
              Moisture:{" "}
              {data.moisture_percent === null ||
              data.moisture_percent === undefined
                ? NOT_REPORTED
                : `${formatNumber(data.moisture_percent)}%`}
              {" · "}Origin: {data.origin ?? NOT_REPORTED}
            </p>
            <div className="mt-2">
              <AddToFormulation ingredient={data} />
            </div>
          </header>

          <ValueTable
            title="Nutrients (per 100 g)"
            rows={data.nutrients}
            empty="No nutrient values are recorded for this ingredient."
            kindOf={(n) => nutrientKind(n.key)}
          />
          <ValueTable
            title="Amino acids"
            rows={data.amino_acids}
            empty="No amino acid profile is reported for this ingredient."
            kindOf={() => "amino_acid"}
          />
          {data.amino_acids.some((a) => a.value === null) && (
            <div
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-small"
            >
              <p className="font-medium">Incomplete amino-acid profile</p>
              <p className="text-muted-foreground">
                No reported value for{" "}
                <span className="font-medium text-foreground">
                  {data.amino_acids
                    .filter((a) => a.value === null)
                    .map((a) => a.name ?? humanizeKey(a.key))
                    .join(", ")}
                </span>
                . Any amino-acid score for this ingredient will be partial.
              </p>
            </div>
          )}
          <AminoAcidChart aminoAcids={data.amino_acids} />

          <Card>
            <CardHeader>
              <CardTitle>Source and licence</CardTitle>
              <CardDescription>{data.source.name}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 text-small">
              {data.source.citation && <p>{data.source.citation}</p>}
              <p>
                <span className="text-muted-foreground">Licence status: </span>
                {data.source.license_status}
              </p>
              <p>
                <span className="text-muted-foreground">Terms: </span>
                {data.source.id === "kfct-2018"
                  ? KFCT_NOTE
                  : (data.source.license_notes ?? NOT_REPORTED)}
              </p>
              {data.source.license_notes && data.source.id === "kfct-2018" && (
                <p className="text-caption text-muted-foreground">
                  {data.source.license_notes}
                </p>
              )}
              {data.dataset_version && (
                <p className="text-caption text-muted-foreground">
                  Dataset version {data.dataset_version}
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </main>
  );
}
