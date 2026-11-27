"use client";

import { PlayIcon } from "lucide-react";
import { useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { ExplainPanel } from "@/components/assistant/explain-panel";
import { JobProgress } from "@/components/jobs/job-progress";
import { NutritionResults } from "@/components/results/nutrition-results";
import { ErrorBlock } from "@/components/workspace/error-block";
import { Button } from "@/components/ui/button";
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
import { useSavedVersion } from "@/hooks/use-saved-version";
import { ApiError } from "@/lib/api/client";
import { getNutrition } from "@/lib/api/results";
import {
  errorMessage,
  formatDateTime,
  formatNumber,
  humanizeKey,
} from "@/lib/format";
import { runJob } from "@/lib/jobs/job-runner";
import {
  describeStartError,
  type StartErrorInfo,
} from "@/lib/jobs/start-error";
import { isTerminal, useJobStore } from "@/stores/jobStore";
import { useResultStore } from "@/stores/resultStore";
import type { AminoAcidBlock } from "@/types";

export function NutritionTab() {
  const { id, version, ready, loadState } = useSavedVersion();
  const { activeJobId, jobType, status } = useJobStore(
    useShallow((s) => ({
      activeJobId: s.activeJobId,
      jobType: s.jobType,
      status: s.status,
    })),
  );
  const stored = useResultStore(
    useShallow((s) => ({
      nutrition: s.nutrition,
      version: s.version,
      jobId: s.nutritionJobId,
      error: s.error,
      loading: s.loading,
    })),
  );
  const [startError, setStartError] = useState<StartErrorInfo | null>(null);

  // Re-fetch after a nutrition job in this session finishes.
  const finishedJob =
    jobType === "nutrition" && status === "completed" ? activeJobId : "";
  const query = useApiQuery(
    ["results", "nutrition", { formulationId: id, version, finishedJob }],
    () => getNutrition(id, version),
    ready,
  );

  const running =
    activeJobId !== null && jobType === "nutrition" && !isTerminal(status);

  async function start() {
    setStartError(null);
    try {
      await runJob(id, version, { type: "nutrition" });
    } catch (error) {
      setStartError(describeStartError(error));
    }
  }

  if (loadState === "loading" || loadState === "idle")
    return <Skeleton className="h-48 w-full" />;
  if (!ready) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-small text-muted-foreground">
        Save the formulation first: calculations run on a saved version.
      </p>
    );
  }

  const fromStore =
    stored.nutrition && stored.version === version ? stored.nutrition : null;
  const result = fromStore ?? query.data;
  const jobId = fromStore ? (stored.jobId ?? fromStore.job_id) : result?.job_id;
  const notFound =
    query.error instanceof ApiError && query.error.status === 404;
  const jobError =
    stored.error && stored.error.jobType === "nutrition"
      ? describeStartError(
          new ApiError(stored.error.message, 0, stored.error.code, {}),
        )
      : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-h3">
          Nutrition and amino acids{" "}
          <span className="text-small font-normal text-muted-foreground">
            v{version}
          </span>
        </h1>
        <Button size="sm" disabled={running} onClick={() => void start()}>
          <PlayIcon aria-hidden />{" "}
          {result ? "Re-run nutrition" : "Run nutrition"}
        </Button>
      </div>

      <JobProgress types={["nutrition"]} />
      {startError && <ErrorBlock error={startError} />}
      {jobError && !running && <ErrorBlock error={jobError} />}

      {!result && query.loading && <Skeleton className="h-48 w-full" />}
      {!result && notFound && !running && (
        <div className="rounded-lg border border-dashed p-6 text-center text-small">
          <p className="font-medium">
            No nutrition result for this version yet
          </p>
          <p className="mt-1 text-muted-foreground">
            {query.error instanceof ApiError &&
            typeof query.error.details.hint === "string"
              ? `Hint: ${query.error.details.hint}. `
              : ""}
            Run nutrition to calculate it from the ingredient data.
          </p>
        </div>
      )}
      {!result && query.error && !notFound && (
        <p role="alert" className="text-small text-destructive">
          {errorMessage(query.error)}
        </p>
      )}

      {result && (
        <>
          <NutritionResults result={result} />
          {result.amino_acids && <AminoAcidTable block={result.amino_acids} />}
          <p className="text-caption text-muted-foreground">
            Provenance: calculation {result.calc_version}
            {jobId ? `, job ${jobId}` : ""}
            {result.finished_at
              ? `, finished ${formatDateTime(result.finished_at)}`
              : ""}
            {typeof result.formulation_version === "number"
              ? `, formulation version ${result.formulation_version}`
              : ""}
            .
          </p>
          {jobId && (
            <ExplainPanel
              target={{ kind: "job", id: jobId }}
              label="Explain nutrition"
            />
          )}
        </>
      )}
    </div>
  );
}

function AminoAcidTable({ block }: { block: AminoAcidBlock }) {
  const scores = new Map(block.scores.map((s) => [s.key, s.score]));
  return (
    <section aria-label="Amino acid detail" className="flex flex-col gap-2">
      <h2 className="text-h4">Amino acids per g protein</h2>
      <p className="text-caption text-muted-foreground">
        Scored against {block.reference_pattern.name} (FAO{" "}
        {block.reference_pattern.version}) by the {block.method} method. Values
        are from the calculation; amino acids without reported data are shown as
        missing, never as zero.
      </p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Amino acid</TableHead>
            <TableHead className="text-right">mg per g protein</TableHead>
            <TableHead className="text-right">Score</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {block.per_g_protein_mg.map((row) => {
            const score = scores.get(row.key);
            const limiting = block.limiting_amino_acid === row.key;
            return (
              <TableRow key={row.key}>
                <TableCell>
                  {humanizeKey(row.key)}
                  {limiting && (
                    <span className="ml-2 text-caption font-medium text-warning">
                      limiting
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right font-numeric">
                  {row.value === null ? (
                    <span className="text-muted-foreground">missing</span>
                  ) : (
                    formatNumber(row.value)
                  )}
                </TableCell>
                <TableCell className="text-right font-numeric">
                  {score === null || score === undefined ? (
                    <span className="text-muted-foreground">missing</span>
                  ) : (
                    formatNumber(score)
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}
