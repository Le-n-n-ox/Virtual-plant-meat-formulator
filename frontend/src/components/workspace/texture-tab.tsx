"use client";

import { FlaskConicalIcon } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { useShallow } from "zustand/react/shallow";
import { ExplainPanel } from "@/components/assistant/explain-panel";
import { JobProgress } from "@/components/jobs/job-progress";
import { TextureResults } from "@/components/results/texture-results";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorBlock } from "@/components/workspace/error-block";
import {
  EMPTY_PROCESS,
  ProcessFields,
  parseProcess,
  type ProcessDraft,
} from "@/components/workspace/process-fields";
import { useApiQuery } from "@/hooks/use-api-query";
import { useSavedVersion } from "@/hooks/use-saved-version";
import { ApiError } from "@/lib/api/client";
import { getJob, getJobResult, listJobs } from "@/lib/api/jobs";
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
import type { TexturePrediction, TextureResult } from "@/types";

const TARGETS = [
  { id: "hardness", label: "Hardness" },
  { id: "chewiness", label: "Chewiness" },
] as const;

export interface TexturePayload extends TextureResult {
  composition?: Record<string, number | null>;
  model_ids?: string[];
  data_versions?: Record<string, string>;
  formulation_version?: number;
  calc_version?: string;
}

export async function loadLatestTexture(
  formulationId: string,
  version?: number,
) {
  const list = await listJobs({
    formulation_id: formulationId,
    type: "texture_prediction",
    status: ["completed"],
    page_size: 20,
  });
  const newest = [...list.items]
    .filter((j) => version === undefined || j.formulation.version === version)
    .sort((a, b) =>
      (b.finished_at ?? b.created_at).localeCompare(
        a.finished_at ?? a.created_at,
      ),
    )[0];
  if (!newest) return null;
  const [raw, job] = await Promise.all([
    getJobResult<{ payload?: TexturePayload }>(newest.id),
    getJob(newest.id),
  ]);
  const payload = raw.payload ?? (raw as unknown as TexturePayload);
  return { jobId: newest.id, job, payload };
}

export function TextureTab() {
  const { id, version, ready, loadState } = useSavedVersion();
  const { activeJobId, jobType, status } = useJobStore(
    useShallow((s) => ({
      activeJobId: s.activeJobId,
      jobType: s.jobType,
      status: s.status,
    })),
  );
  const runError = useResultStore((s) => s.error);
  const [process, setProcess] = useState<ProcessDraft>(EMPTY_PROCESS);
  const [targets, setTargets] = useState<string[]>(["hardness", "chewiness"]);
  const [formError, setFormError] = useState<string | null>(null);
  const [startError, setStartError] = useState<StartErrorInfo | null>(null);

  const finishedJob =
    jobType === "texture_prediction" && status === "completed"
      ? activeJobId
      : "";
  const query = useApiQuery(
    ["results", "texture", { formulationId: id, finishedJob }],
    () => loadLatestTexture(id),
    ready,
  );
  const running =
    activeJobId !== null &&
    jobType === "texture_prediction" &&
    !isTerminal(status);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setStartError(null);
    const parsed = parseProcess(process, true);
    const moisture = parsed.process?.moisture_percent;
    if (!parsed.process || parsed.error || moisture === undefined) {
      setFormError(parsed.error ?? "Check the process conditions.");
      return;
    }
    if (targets.length === 0) {
      setFormError("Choose at least one target.");
      return;
    }
    setFormError(null);
    try {
      await runJob(id, version, {
        type: "texture_prediction",
        params: {
          process: { ...parsed.process, moisture_percent: moisture },
          targets,
        },
      });
    } catch (error) {
      setStartError(describeStartError(error));
    }
  }

  if (loadState === "loading" || loadState === "idle")
    return <Skeleton className="h-48 w-full" />;
  if (!ready) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Save the formulation first: calculations run on a saved version.
      </p>
    );
  }

  const latest = query.data;
  const jobFailure =
    runError && runError.jobType === "texture_prediction"
      ? describeStartError(new ApiError(runError.message, 0, runError.code, {}))
      : null;

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">
        Texture prediction{" "}
        <span className="text-sm font-normal text-muted-foreground">
          v{version}
        </span>
      </h1>

      <form
        onSubmit={submit}
        className="flex flex-col gap-3 rounded-lg border p-3"
        aria-label="Predict texture"
      >
        <h2 className="text-sm font-medium">Predict texture</h2>
        <p className="text-xs text-muted-foreground">
          Process conditions are model inputs. The result is a
          literature-derived estimate, not a measurement.
        </p>
        <ProcessFields
          idPrefix="tx"
          value={process}
          onChange={setProcess}
          moistureRequired
        />
        <fieldset className="flex flex-wrap gap-4">
          <legend className="sr-only">Targets</legend>
          {TARGETS.map((t) => (
            <label key={t.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={targets.includes(t.id)}
                onChange={(e) =>
                  setTargets((cur) =>
                    e.target.checked
                      ? [...cur, t.id]
                      : cur.filter((x) => x !== t.id),
                  )
                }
              />
              {t.label}
            </label>
          ))}
        </fieldset>
        {formError && (
          <p role="alert" className="text-sm text-destructive">
            {formError}
          </p>
        )}
        <div>
          <Button type="submit" size="sm" disabled={running}>
            <FlaskConicalIcon aria-hidden /> Predict texture
          </Button>
        </div>
      </form>

      <JobProgress types={["texture_prediction"]} />
      {startError && <ErrorBlock error={startError} />}
      {jobFailure && !running && <ErrorBlock error={jobFailure} />}

      {query.loading && <Skeleton className="h-40 w-full" />}
      {query.error && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(query.error)}
        </p>
      )}
      {!query.loading && !query.error && !latest && (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm">
          <p className="font-medium">No texture prediction yet</p>
          <p className="mt-1 text-muted-foreground">
            Enter the process conditions above and run a prediction.
          </p>
        </div>
      )}
      {latest && (
        <LatestTexture
          jobId={latest.jobId}
          payload={latest.payload}
          finishedAt={latest.job.finished_at}
          jobVersion={latest.job.formulation_version}
          currentVersion={version}
          calcVersion={latest.job.calc_version}
        />
      )}
    </div>
  );
}

function LatestTexture({
  jobId,
  payload,
  finishedAt,
  jobVersion,
  currentVersion,
  calcVersion,
}: {
  jobId: string;
  payload: TexturePayload;
  finishedAt: string | null;
  jobVersion: number;
  currentVersion: number;
  calcVersion: string | null;
}) {
  const process = payload.process ?? {};
  const models = new Map<string, TexturePrediction["model"]>();
  for (const p of payload.predictions)
    if (p.model) models.set(p.model.id, p.model);
  const composition = payload.composition
    ? Object.entries(payload.composition)
    : [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <Badge variant="secondary">Formulation v{jobVersion}</Badge>
        <span>
          Job {jobId}, finished {formatDateTime(finishedAt)}
        </span>
      </div>
      {jobVersion !== currentVersion && (
        <p className="rounded-lg border border-warning/70 bg-warning/10 p-2 text-xs">
          This prediction was made for version {jobVersion}; the current saved
          version is {currentVersion}. Run a new prediction to see the current
          one.
        </p>
      )}
      <TextureResults result={payload} />

      <section aria-label="Process conditions used" className="text-sm">
        <h2 className="mb-1 text-sm font-medium">Process conditions used</h2>
        {Object.keys(process).length === 0 ? (
          <p className="text-xs text-muted-foreground">not reported</p>
        ) : (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-xs">
            {Object.entries(process).map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{humanizeKey(k)}</dt>
                <dd className="tabular-nums">
                  {typeof v === "number" ? formatNumber(v) : JSON.stringify(v)}
                </dd>
              </div>
            ))}
          </dl>
        )}
      </section>

      {composition.length > 0 && (
        <section aria-label="Composition features used">
          <h2 className="mb-1 text-sm font-medium">
            Composition features used (g per 100 g)
          </h2>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-xs">
            {composition.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{humanizeKey(k)}</dt>
                <dd className="tabular-nums">
                  {v === null ? (
                    <span className="text-muted-foreground">missing</span>
                  ) : (
                    formatNumber(v)
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      <section aria-label="Models used" className="text-xs">
        <h2 className="mb-1 text-sm font-medium">Models</h2>
        <ul className="flex flex-col gap-0.5">
          {[...models.values()].map((m) => (
            <li key={m.id}>
              <Link
                href="/models"
                className="text-primary underline underline-offset-4"
              >
                {humanizeKey(m.target)}: {m.algorithm} v{m.version}
              </Link>{" "}
              <span className="font-mono text-muted-foreground">{m.id}</span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-muted-foreground">
          {calcVersion ? `Calculation ${calcVersion}. ` : ""}
          {payload.data_versions
            ? `Data: ${Object.entries(payload.data_versions)
                .filter(([k]) => !k.startsWith("model:"))
                .map(([k, v]) => `${k} ${v}`)
                .join(", ")}.`
            : ""}
        </p>
      </section>

      <ExplainPanel
        target={{ kind: "job", id: jobId }}
        label="Explain texture prediction"
      />
    </div>
  );
}
