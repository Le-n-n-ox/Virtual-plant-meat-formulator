"use client";

import { DownloadIcon } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { ModelBadge } from "@/components/models/model-badge";
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
import { getIngredient } from "@/lib/api/ingredients";
import { getNutrition } from "@/lib/api/results";
import {
  errorMessage,
  formatDateTime,
  formatNumber,
  humanizeKey,
  NOT_REPORTED,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { displayNutrientValue, nutrientKind } from "@/lib/units";
import { usePreferencesStore } from "@/stores/preferencesStore";
import type { IngredientDetail, TexturePrediction } from "@/types";

const SUMMARY_NUTRIENTS = [
  "protein",
  "fat",
  "carbohydrate_available",
  "fibre",
  "energy_kcal",
];

export function ReportTab() {
  const { id, version: current, ready, loadState } = useSavedVersion();
  const prefs = usePreferencesStore();
  const [chosen, setChosen] = useState<number | null>(null);
  const version = chosen ?? current;
  const [busy, setBusy] = useState<ExportFormat | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const versions = useApiQuery(
    ["formulations", id, "versions", { page_size: 100 }],
    () => listVersions(id, { page_size: 100 }),
    ready,
  );
  const detail = useApiQuery(
    ["formulations", id, "versions", version],
    () => getVersion(id, version),
    ready,
  );
  const nutrition = useApiQuery(
    ["results", "nutrition", { formulationId: id, version }],
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
    ["results", "texture", { formulationId: id, version }],
    () => loadLatestTexture(id, version),
    ready,
  );
  const nameOf = useIngredientNames(
    detail.data?.lines.map((l) => l.ingredient_id) ?? [],
  );
  const lineIds = [
    ...new Set(detail.data?.lines.map((l) => l.ingredient_id) ?? []),
  ];
  const details = useApiQuery(
    ["ingredients", { formulationId: id, version, lineIds }],
    () =>
      Promise.all(
        lineIds.map(
          async (ingredientId) =>
            [
              ingredientId,
              await getIngredient(ingredientId).catch(() => null),
            ] as const,
        ),
      ),
    lineIds.length > 0,
  );
  const ingredientById: Record<string, IngredientDetail> = {};
  for (const [ingredientId, record] of details.data ?? []) {
    if (record) ingredientById[ingredientId] = record;
  }

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
      <p className="rounded-lg border border-dashed p-4 text-small text-muted-foreground">
        Save the formulation first: reports are built from a saved version.
      </p>
    );
  }

  const n = nutrition.data;
  const models = new Map<string, TexturePrediction["model"]>();
  for (const p of texture.data?.payload.predictions ?? [])
    if (p.model) models.set(p.model.id, p.model);

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-h3">Report</h1>

      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-small">
          Version
          <select
            aria-label="Report version"
            value={version}
            onChange={(e) => setChosen(Number(e.target.value))}
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-small dark:bg-input/30"
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
        <p role="alert" className="text-small text-destructive">
          {downloadError}
        </p>
      )}
      <p className="text-caption text-muted-foreground">
        Exports exclude or summarise data whose licence does not allow
        redistribution (restricted-licence data).
      </p>

      <section aria-label="Formulation" className="rounded-lg border p-3">
        <h2 className="mb-2 flex items-center gap-2 text-h4">
          Formulation <Badge variant="secondary">v{version}</Badge>
        </h2>
        {detail.loading ? (
          <Skeleton className="h-16 w-full" />
        ) : detail.error ? (
          <p role="alert" className="text-small text-destructive">
            {errorMessage(detail.error)}
          </p>
        ) : (
          <ul className="text-small">
            {detail.data?.lines.map((l) => (
              <li
                key={l.ingredient_id}
                className="flex justify-between gap-2 border-t py-1 first:border-t-0"
              >
                <span>{nameOf(l.ingredient_id)}</span>
                <span className="font-numeric">{formatNumber(l.percent)}%</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Nutrition summary" className="rounded-lg border p-3">
        <h2 className="mb-2 text-h4">Nutrition (per 100 g)</h2>
        {nutrition.loading ? (
          <Skeleton className="h-16 w-full" />
        ) : nutrition.error ? (
          <p role="alert" className="text-small text-destructive">
            {errorMessage(nutrition.error)}
          </p>
        ) : !n ? (
          <p className="text-small text-muted-foreground">
            No nutrition result for this version. Run it on the Nutrition tab
            and it will be included.
          </p>
        ) : (
          <>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-small">
              {n.nutrients
                .filter((x) => SUMMARY_NUTRIENTS.includes(x.key))
                .map((x) => (
                  <div key={x.key} className="contents">
                    <dt className="text-muted-foreground">
                      {x.name ?? humanizeKey(x.key)}
                    </dt>
                    <dd className="font-numeric">
                      {(() => {
                        const shown = displayNutrientValue(
                          x.value,
                          x.unit,
                          nutrientKind(x.key),
                          prefs,
                        );
                        return shown ? (
                          `${formatNumber(shown.value)} ${shown.unit}`
                        ) : (
                          <span className="text-muted-foreground">missing</span>
                        );
                      })()}
                    </dd>
                  </div>
                ))}
              <dt className="text-muted-foreground">AAS</dt>
              <dd className="font-numeric">
                {n.amino_acids?.score == null
                  ? "missing"
                  : formatNumber(n.amino_acids.score)}
                {n.amino_acids?.limiting_amino_acid
                  ? ` (limiting: ${humanizeKey(n.amino_acids.limiting_amino_acid)})`
                  : ""}
              </dd>
            </dl>
            <p className="mt-2 text-caption text-muted-foreground">
              Calculation {n.calc_version}
              {n.finished_at ? `, ${formatDateTime(n.finished_at)}` : ""}.
            </p>
          </>
        )}
      </section>

      <section aria-label="Texture summary" className="rounded-lg border p-3">
        <h2 className="mb-2 flex flex-wrap items-center gap-2 text-h4">
          Texture
          <Badge variant="outline" className="border-warning/60">
            Literature-derived estimate
          </Badge>
        </h2>
        {texture.loading ? (
          <Skeleton className="h-16 w-full" />
        ) : texture.error ? (
          <p role="alert" className="text-small text-destructive">
            {errorMessage(texture.error)}
          </p>
        ) : !texture.data ? (
          <p className="text-small text-muted-foreground">
            No texture prediction for this version.
          </p>
        ) : (
          <>
            <ul className="text-small">
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
                      <span className="font-numeric">
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
            <div className="mt-2 flex flex-col gap-1.5">
              <p className="text-caption font-medium text-muted-foreground">
                Models
              </p>
              {models.size === 0 ? (
                <p className="text-caption text-muted-foreground">
                  {NOT_REPORTED}
                </p>
              ) : (
                [...models.values()].map((m) => (
                  <ModelBadge key={m.id} model={m} />
                ))
              )}
            </div>
          </>
        )}
      </section>

      <section
        aria-label="Data sources"
        className="rounded-lg border p-3 text-small"
      >
        <h2 className="mb-2 text-h4">Data sources</h2>
        {details.loading ? (
          <Skeleton className="h-16 w-full" />
        ) : details.error ? (
          <p role="alert" className="text-small text-destructive">
            {errorMessage(details.error)}
          </p>
        ) : lineIds.length === 0 ? (
          <p className="text-small text-muted-foreground">
            This version has no ingredients.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-small">
              <thead className="text-left text-caption text-muted-foreground">
                <tr>
                  <th className="py-1 font-medium">Ingredient</th>
                  <th className="py-1 font-medium">Source</th>
                  <th className="py-1 font-medium">Licence</th>
                  <th className="py-1 font-medium">Dataset</th>
                </tr>
              </thead>
              <tbody>
                {lineIds.map((ingredientId) => {
                  const record = ingredientById[ingredientId];
                  return (
                    <tr key={ingredientId} className="border-t">
                      <td className="py-1 pr-2">{nameOf(ingredientId)}</td>
                      <td className="py-1 pr-2 text-caption">
                        {record?.source.name ?? "not reported"}
                      </td>
                      <td className="py-1 pr-2 text-caption">
                        {record?.source.license_status ?? "not reported"}
                      </td>
                      <td className="py-1 text-caption text-muted-foreground">
                        {record?.dataset_version ?? "not reported"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-caption text-muted-foreground">
          Values are the weighted mixture of the source data for each
          ingredient; the calculation is deterministic, not a prediction.
        </p>
      </section>

      <section
        aria-label="Audit trail"
        className="rounded-lg border p-3 text-small"
      >
        <h2 className="mb-2 text-h4">Audit trail</h2>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-caption">
          <dt className="text-muted-foreground">Formulation</dt>
          <dd>
            v{version}
            {detail.data?.updated_at
              ? `, saved ${formatDateTime(detail.data.updated_at)}`
              : ""}
          </dd>
          <dt className="text-muted-foreground">Nutrition calculation</dt>
          <dd>
            {n?.calc_version
              ? `${n.calc_version}${n.finished_at ? `, ${formatDateTime(n.finished_at)}` : ""}`
              : "not run for this version"}
          </dd>
          <dt className="text-muted-foreground">Texture job</dt>
          <dd>
            {texture.data ? (
              <>
                <Link
                  href={`/jobs/${texture.data.jobId}`}
                  className="text-primary underline underline-offset-4"
                >
                  {texture.data.jobId}
                </Link>
                {`, formulation v${texture.data.job.formulation_version}`}
              </>
            ) : (
              "no texture prediction for this version"
            )}
          </dd>
        </dl>
        <h3 className="mt-3 text-caption font-medium text-muted-foreground">
          Version history
        </h3>
        {versions.loading ? (
          <Skeleton className="mt-1 h-12 w-full" />
        ) : (
          <ul className="mt-1 flex flex-col gap-1 text-caption">
            {(versions.data?.items ?? []).map((v) => (
              <li
                key={v.version}
                className={cn(
                  "flex flex-wrap items-center gap-2 border-t pt-1 first:border-t-0 first:pt-0",
                  v.version === version && "font-medium",
                )}
              >
                <span className="font-numeric">v{v.version}</span>
                <span className="text-muted-foreground">
                  {formatDateTime(v.created_at)}
                </span>
                {v.created_by && (
                  <span className="text-muted-foreground">
                    by {v.created_by}
                  </span>
                )}
                {v.note && (
                  <span className="text-muted-foreground">— {v.note}</span>
                )}
                {v.version === version && <Badge>this report</Badge>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
