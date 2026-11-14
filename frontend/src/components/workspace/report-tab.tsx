"use client";

import { DownloadIcon } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { loadLatestTexture } from "@/components/workspace/texture-tab";
import { useApiQuery } from "@/hooks/use-api-query";
import { useIngredientNames } from "@/hooks/use-ingredient-names";
import { useSavedVersion } from "@/hooks/use-saved-version";
import { ApiError } from "@/lib/api/client";
import { downloadExport, saveBlob, type ExportFormat } from "@/lib/api/exports";
import { getVersion, listVersions } from "@/lib/api/formulations";
import { getNutrition } from "@/lib/api/results";
import {
  errorMessage,
  formatDateTime,
  formatNumber,
  humanizeKey,
  NOT_REPORTED,
} from "@/lib/format";

const SUMMARY_NUTRIENTS = [
  "protein",
  "fat",
  "carbohydrate_available",
  "fibre",
  "energy_kcal",
];

export function ReportTab() {
  const { id, version: current, ready, loadState } = useSavedVersion();
  const [chosen, setChosen] = useState<number | null>(null);
  const version = chosen ?? current;
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const versions = useApiQuery(
    `report-versions|${id}|${current}`,
    () => listVersions(id, { page_size: 100 }),
    ready,
  );
  const detail = useApiQuery(
    `report-version|${id}|${version}`,
    () => getVersion(id, version),
    ready,
  );
  const nutrition = useApiQuery(
    `report-nutrition|${id}|${version}`,
    async () => {
      try {
        return await getNutrition(id, version);
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    ready,
  );
  const texture = useApiQuery(
    `report-texture|${id}|${version}`,
    () => loadLatestTexture(id, version),
    ready,
  );
  const nameOf = useIngredientNames(
    detail.data?.lines.map((l) => l.ingredient_id) ?? [],
  );

  async function download(format: ExportFormat) {
    setBusy(format);
    setDownloadError(null);
    try {
      const { blob, filename } = await downloadExport(id, format, version);
      saveBlob(blob, filename);
    } catch (error) {
      setDownloadError(errorMessage(error));
    } finally {
      setBusy(null);
    }
  }

  if (loadState === "loading" || loadState === "idle")
    return <Skeleton className="h-48 w-full" />;
  if (!ready) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        Save the formulation first: reports are built from a saved version.
      </p>
    );
  }

  const n = nutrition.data;
  const models = new Map<string, string>();
  for (const p of texture.data?.payload.predictions ?? [])
    if (p.model)
      models.set(p.model.id, `${p.model.algorithm} v${p.model.version}`);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Report</h1>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          Version
          <select
            aria-label="Report version"
            value={version}
            onChange={(e) => setChosen(Number(e.target.value))}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm dark:bg-input/30"
          >
            {(versions.data?.items ?? [{ version: current }]).map((v) => (
              <option key={v.version} value={v.version}>
                v{v.version}
                {v.version === current ? " (current)" : ""}
              </option>
            ))}
          </select>
        </label>
        <Button
          size="sm"
          disabled={busy !== null}
          onClick={() => void download("pdf")}
        >
          <DownloadIcon aria-hidden />{" "}
          {busy === "pdf" ? "Preparing PDF…" : "Download PDF"}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={() => void download("csv")}
        >
          <DownloadIcon aria-hidden />{" "}
          {busy === "csv" ? "Preparing CSV…" : "Download CSV"}
        </Button>
      </div>
      {downloadError && (
        <p role="alert" className="text-sm text-destructive">
          {downloadError}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Exports exclude or summarise data whose licence does not allow
        redistribution (restricted-licence data).
      </p>

      <section aria-label="Formulation" className="rounded-lg border p-3">
        <h2 className="mb-2 flex items-center gap-2 text-sm font-medium">
          Formulation <Badge variant="secondary">v{version}</Badge>
        </h2>
        {detail.loading ? (
          <Skeleton className="h-16 w-full" />
        ) : detail.error ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(detail.error)}
          </p>
        ) : (
          <ul className="text-sm">
            {detail.data?.lines.map((l) => (
              <li
                key={l.ingredient_id}
                className="flex justify-between gap-2 border-t py-1 first:border-t-0"
              >
                <span>{nameOf(l.ingredient_id)}</span>
                <span className="tabular-nums">{formatNumber(l.percent)}%</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Nutrition summary" className="rounded-lg border p-3">
        <h2 className="mb-2 text-sm font-medium">Nutrition (per 100 g)</h2>
        {nutrition.loading ? (
          <Skeleton className="h-16 w-full" />
        ) : nutrition.error ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(nutrition.error)}
          </p>
        ) : !n ? (
          <p className="text-sm text-muted-foreground">
            No nutrition result for this version. Run it on the Nutrition tab
            and it will be included.
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm">
              {n.nutrients
                .filter((x) => SUMMARY_NUTRIENTS.includes(x.key))
                .map((x) => (
                  <div key={x.key} className="contents">
                    <dt className="text-muted-foreground">
                      {x.name ?? humanizeKey(x.key)}
                    </dt>
                    <dd className="tabular-nums">
                      {x.value === null ? (
                        <span className="text-muted-foreground">missing</span>
                      ) : (
                        `${formatNumber(x.value)} ${x.unit}`
                      )}
                    </dd>
                  </div>
                ))}
              <dt className="text-muted-foreground">AAS</dt>
              <dd className="tabular-nums">
                {n.amino_acids?.score == null
                  ? "missing"
                  : formatNumber(n.amino_acids.score)}
                {n.amino_acids?.limiting_amino_acid
                  ? ` (limiting: ${humanizeKey(n.amino_acids.limiting_amino_acid)})`
                  : ""}
              </dd>
            </dl>
            <p className="mt-2 text-xs text-muted-foreground">
              Calculation {n.calc_version}
              {n.finished_at ? `, ${formatDateTime(n.finished_at)}` : ""}.
            </p>
          </>
        )}
      </section>

      <section aria-label="Texture summary" className="rounded-lg border p-3">
        <h2 className="mb-2 flex flex-wrap items-center gap-2 text-sm font-medium">
          Texture
          <Badge variant="outline" className="border-warning/60">
            Literature-derived estimate
          </Badge>
        </h2>
        {texture.loading ? (
          <Skeleton className="h-16 w-full" />
        ) : texture.error ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(texture.error)}
          </p>
        ) : !texture.data ? (
          <p className="text-sm text-muted-foreground">
            No texture prediction for this version.
          </p>
        ) : (
          <>
            <ul className="text-sm">
              {texture.data.payload.predictions.map((p) => {
                const iv = p.interval as unknown;
                const value = p.value as number | null | undefined;
                return (
                  <li key={p.target} className="py-0.5">
                    {humanizeKey(p.target)}:{" "}
                    {value === null || value === undefined ? (
                      <span className="text-muted-foreground">
                        no supported estimate
                      </span>
                    ) : (
                      <span className="tabular-nums">
                        {formatNumber(value)} {p.unit}
                        {Array.isArray(iv) && iv.length === 2
                          ? ` (${Math.round((p.interval_level ?? 0.9) * 100)}% interval ${formatNumber(Number(iv[0]))} to ${formatNumber(Number(iv[1]))})`
                          : ""}
                        {p.in_domain === false ? ", outside model domain" : ""}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              Models:{" "}
              {models.size === 0
                ? NOT_REPORTED
                : [...models.values()].join(", ")}
              .
            </p>
          </>
        )}
      </section>
    </div>
  );
}
