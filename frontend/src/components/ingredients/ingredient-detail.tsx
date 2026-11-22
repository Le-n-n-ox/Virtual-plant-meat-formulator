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
import { getIngredient } from "@/lib/api/ingredients";
import {
  errorMessage,
  formatNumber,
  humanizeKey,
  NOT_REPORTED,
} from "@/lib/format";
import type { NutrientValue } from "@/types";

const KFCT_NOTE = "Non-commercial research use with acknowledgement";

function ValueTable({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: NutrientValue[];
  empty: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead>Quality</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((n) => (
                <TableRow key={n.key}>
                  <TableCell>{n.name ?? humanizeKey(n.key)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {n.value === null ? (
                      <span className="text-muted-foreground">
                        {NOT_REPORTED}
                      </span>
                    ) : (
                      <>
                        {formatNumber(n.value)}{" "}
                        <span className="text-muted-foreground">{n.unit}</span>
                      </>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
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
  const { data, error, loading } = useApiQuery(`ingredient|${id}`, () =>
    getIngredient(id),
  );

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <Link
        href="/ingredients"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" aria-hidden /> Ingredient catalogue
      </Link>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : loading || !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <>
          <header className="flex flex-col gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              {data.common_name}
            </h1>
            {data.scientific_name && (
              <p className="text-sm text-muted-foreground italic">
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
            <p className="text-xs text-muted-foreground">
              Moisture:{" "}
              {data.moisture_percent === null ||
              data.moisture_percent === undefined
                ? NOT_REPORTED
                : `${formatNumber(data.moisture_percent)}%`}
              {" · "}Origin: {data.origin ?? NOT_REPORTED}
            </p>
          </header>

          <ValueTable
            title="Nutrients (per 100 g)"
            rows={data.nutrients}
            empty="No nutrient values are recorded for this ingredient."
          />
          <ValueTable
            title="Amino acids"
            rows={data.amino_acids}
            empty="No amino acid profile is reported for this ingredient."
          />
          {data.amino_acids.some((a) => a.value === null) && (
            <p className="text-xs text-destructive">
              {data.amino_acids
                .filter((a) => a.value === null)
                .map((a) => a.name ?? humanizeKey(a.key))
                .join(", ")}{" "}
              {data.amino_acids.filter((a) => a.value === null).length === 1
                ? "has"
                : "have"}{" "}
              no reported value, so any amino-acid score for this ingredient is
              partial.
            </p>
          )}
          <AminoAcidChart aminoAcids={data.amino_acids} />

          <Card>
            <CardHeader>
              <CardTitle>Source and licence</CardTitle>
              <CardDescription>{data.source.name}</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-1.5 text-sm">
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
                <p className="text-xs text-muted-foreground">
                  {data.source.license_notes}
                </p>
              )}
              {data.dataset_version && (
                <p className="text-xs text-muted-foreground">
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
