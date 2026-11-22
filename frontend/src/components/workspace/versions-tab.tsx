"use client";

import {
  ArrowRightIcon,
  MinusIcon,
  PlusIcon,
  RotateCcwIcon,
} from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import { useIngredientNames } from "@/hooks/use-ingredient-names";
import { useSavedVersion } from "@/hooks/use-saved-version";
import { ApiError } from "@/lib/api/client";
import {
  getVersion,
  listVersions,
  restoreVersion,
} from "@/lib/api/formulations";
import { errorMessage, formatDateTime, formatNumber } from "@/lib/format";
import {
  diffVersionLines,
  isEmptyDiff,
  type VersionChange,
} from "@/lib/version-diff";
import { useInvalidateResource } from "@/lib/query/invalidate";
import { cn } from "@/lib/utils";
import { useFormulationStore } from "@/stores/formulationStore";
import { useResultStore } from "@/stores/resultStore";

function pct(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "—" : formatNumber(value);
}

function ChangeRow({
  change,
  fromName,
  toName,
}: {
  change: VersionChange;
  fromName: (id: string) => string;
  toName: (id: string) => string;
}) {
  const styles: Record<VersionChange["kind"], string> = {
    added: "border-success/50 bg-success/10",
    removed: "border-destructive/50 bg-destructive/10",
    changed: "border-warning/60 bg-warning/10",
  };
  const labels: Record<VersionChange["kind"], string> = {
    added: "Added",
    removed: "Removed",
    changed: "Changed",
  };
  const icon =
    change.kind === "added" ? (
      <PlusIcon className="size-3.5" aria-hidden />
    ) : change.kind === "removed" ? (
      <MinusIcon className="size-3.5" aria-hidden />
    ) : (
      <ArrowRightIcon className="size-3.5" aria-hidden />
    );

  const name =
    change.kind === "removed"
      ? fromName(change.ingredientId)
      : toName(change.ingredientId);

  return (
    <li
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5",
        styles[change.kind],
      )}
    >
      <span className="flex items-center gap-1 text-xs font-medium">
        {icon}
        {labels[change.kind]}
      </span>
      <span className="font-medium">{name}</span>
      <span className="ml-auto tabular-nums">
        {change.kind === "changed" && (
          <>
            {pct(change.fromPercent)}%{" "}
            <ArrowRightIcon className="inline size-3" aria-hidden />{" "}
          </>
        )}
        {change.kind === "removed" ? (
          `${pct(change.fromPercent)}%`
        ) : (
          <>
            {pct(change.toPercent)}%
            {change.kind === "added" && (
              <span className="ml-1 text-xs font-normal">of mass</span>
            )}
          </>
        )}
      </span>
    </li>
  );
}

function DiffView({
  diff,
  fromName,
  toName,
  fromVersion,
  toVersion,
}: {
  diff: ReturnType<typeof diffVersionLines>;
  fromName: (id: string) => string;
  toName: (id: string) => string;
  fromVersion: number;
  toVersion: number;
}) {
  const total = diff.added.length + diff.removed.length + diff.changed.length;

  if (isEmptyDiff(diff)) {
    return (
      <p className="text-sm text-muted-foreground">
        No ingredient changes between v{fromVersion} and v{toVersion}.
      </p>
    );
  }

  const groups: Array<{
    title: string;
    changes: VersionChange[];
    tone: string;
  }> = [
    { title: "Added", changes: diff.added, tone: "text-success" },
    { title: "Removed", changes: diff.removed, tone: "text-destructive" },
    { title: "Changed", changes: diff.changed, tone: "text-warning" },
  ];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground" aria-live="polite">
        {total} change{total === 1 ? "" : "s"} from v{fromVersion} to v
        {toVersion}: {diff.added.length} added, {diff.removed.length} removed,{" "}
        {diff.changed.length} changed.
      </p>
      {groups.map(
        (group) =>
          group.changes.length > 0 && (
            <div key={group.title} className="flex flex-col gap-1">
              <h3 className={cn("text-xs font-medium", group.tone)}>
                {group.title}
              </h3>
              <ul className="flex flex-col gap-1">
                {group.changes.map((change) => (
                  <ChangeRow
                    key={change.ingredientId}
                    change={change}
                    fromName={fromName}
                    toName={toName}
                  />
                ))}
              </ul>
            </div>
          ),
      )}
    </div>
  );
}

export function VersionsTab() {
  const { id, version: current, ready, loadState } = useSavedVersion();
  const invalidate = useInvalidateResource();
  const [viewing, setViewing] = useState<number | null>(null);
  const [diffFrom, setDiffFrom] = useState<number | null>(null);
  const [diffTo, setDiffTo] = useState<number | null>(null);
  const [diffSeeded, setDiffSeeded] = useState(false);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const versions = useApiQuery(
    ["formulations", id, "versions", { page_size: 100 }],
    () => listVersions(id, { page_size: 100 }),
    ready,
  );
  const detail = useApiQuery(
    ["formulations", id, "versions", viewing],
    () => getVersion(id, viewing ?? 1),
    ready && viewing !== null,
  );
  const diffFromDetail = useApiQuery(
    ["formulations", id, "versions", diffFrom],
    () => getVersion(id, diffFrom ?? 1),
    ready && diffFrom !== null,
  );
  const diffToDetail = useApiQuery(
    ["formulations", id, "versions", diffTo],
    () => getVersion(id, diffTo ?? 1),
    ready && diffTo !== null,
  );

  /** Default the comparison to the current version and the one before it. */
  const versionNumbers =
    versions.data?.items.map((v) => v.version).sort((a, b) => a - b) ?? [];
  if (!diffSeeded && versionNumbers.length > 0) {
    setDiffSeeded(true);
    const to = current ?? versionNumbers[versionNumbers.length - 1];
    const index = versionNumbers.indexOf(to);
    setDiffTo(to);
    setDiffFrom(index > 0 ? versionNumbers[index - 1] : to);
  }
  const nameOf = useIngredientNames(
    detail.data?.lines.map((l) => l.ingredient_id) ?? [],
  );
  const diffFromName = useIngredientNames(
    diffFromDetail.data?.lines.map((l) => l.ingredient_id) ?? [],
  );
  const diffToName = useIngredientNames(
    diffToDetail.data?.lines.map((l) => l.ingredient_id) ?? [],
  );

  async function restore() {
    if (confirming === null) return;
    setPending(true);
    setError(null);
    setConflict(false);
    try {
      const restored = await restoreVersion(id, confirming, {
        base_version: current,
      });
      setNotice(
        `Version ${confirming} was restored as version ${restored.version}.`,
      );
      setConfirming(null);
      useResultStore.getState().clear();
      useFormulationStore.getState().requestReload();
      invalidate("formulations");
      invalidate("results");
    } catch (e) {
      if (e instanceof ApiError && e.code === "version_conflict") {
        setConflict(true);
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setPending(false);
    }
  }

  if (loadState === "loading" || loadState === "idle")
    return <Skeleton className="h-48 w-full" />;
  if (!ready) {
    return (
      <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">
        This formulation has no saved versions yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-lg font-semibold">Version history</h1>
      <p className="text-xs text-muted-foreground">
        Restoring creates a new version with the old lines; history is never
        changed.
      </p>
      {notice && (
        <p role="status" className="text-sm text-success">
          {notice}
        </p>
      )}
      {versions.loading && <Skeleton className="h-32 w-full" />}
      {versions.error && (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(versions.error)}
        </p>
      )}
      {versions.data && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[480px] text-sm">
            <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2 font-medium">Version</th>
                <th className="p-2 font-medium">Created</th>
                <th className="p-2 font-medium">By</th>
                <th className="p-2 font-medium">Note</th>
                <th className="p-2 font-medium">Hash</th>
                <th className="p-2">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {versions.data.items.map((v) => (
                <tr
                  key={v.version}
                  className={cn(
                    "cursor-pointer border-t hover:bg-muted/30",
                    viewing === v.version && "bg-accent/50",
                  )}
                  onClick={() => setViewing(v.version)}
                >
                  <td className="p-2 font-medium">
                    <button
                      type="button"
                      className="underline underline-offset-4"
                      aria-label={`View version ${v.version}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setViewing(v.version);
                      }}
                    >
                      v{v.version}
                    </button>{" "}
                    {v.version === current && (
                      <Badge variant="secondary">current</Badge>
                    )}
                  </td>
                  <td className="p-2 whitespace-nowrap">
                    {formatDateTime(v.created_at)}
                  </td>
                  <td className="p-2">{v.created_by ?? "unknown"}</td>
                  <td className="p-2 text-muted-foreground">
                    {v.note ?? "none"}
                  </td>
                  <td className="p-2 font-mono text-xs">
                    {v.content_hash.slice(0, 8)}
                  </td>
                  <td className="p-2 text-right">
                    {v.version !== current && (
                      <Button
                        size="xs"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation();
                          setConflict(false);
                          setError(null);
                          setConfirming(v.version);
                        }}
                      >
                        <RotateCcwIcon aria-hidden /> Restore
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <section
        aria-label="Compare versions"
        className="flex flex-col gap-3 rounded-lg border p-3"
      >
        <div>
          <h2 className="text-sm font-medium">Compare two versions</h2>
          <p className="text-xs text-muted-foreground">
            Shows what was added, removed and changed between the two saved
            versions.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs">
            From
            <select
              className="h-8 rounded-lg border px-2 text-sm"
              value={diffFrom ?? ""}
              onChange={(e) =>
                setDiffFrom(
                  e.target.value === "" ? null : Number(e.target.value),
                )
              }
            >
              {versionNumbers.map((v) => (
                <option key={v} value={v}>
                  v{v}
                </option>
              ))}
            </select>
          </label>
          <ArrowRightIcon
            className="size-4 text-muted-foreground"
            aria-hidden
          />
          <label className="flex items-center gap-1.5 text-xs">
            To
            <select
              className="h-8 rounded-lg border px-2 text-sm"
              value={diffTo ?? ""}
              onChange={(e) =>
                setDiffTo(e.target.value === "" ? null : Number(e.target.value))
              }
            >
              {versionNumbers.map((v) => (
                <option key={v} value={v}>
                  v{v}
                </option>
              ))}
            </select>
          </label>
        </div>

        {diffFrom === null ||
        diffTo === null ||
        (diffFromDetail.loading && diffToDetail.loading) ? (
          <Skeleton className="h-16 w-full" />
        ) : diffFromDetail.error || diffToDetail.error ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(diffFromDetail.error ?? diffToDetail.error)}
          </p>
        ) : diffFromDetail.data && diffToDetail.data ? (
          <DiffView
            diff={diffVersionLines(
              diffFromDetail.data.lines,
              diffToDetail.data.lines,
            )}
            fromName={diffFromName}
            toName={diffToName}
            fromVersion={diffFrom}
            toVersion={diffTo}
          />
        ) : null}
      </section>

      {viewing !== null && (
        <section
          aria-label={`Version ${viewing} ingredients`}
          className="rounded-lg border p-3"
        >
          <h2 className="mb-2 text-sm font-medium">Version {viewing}</h2>
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
                  <span className="tabular-nums">
                    {formatNumber(l.percent)}%
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open && !pending) setConfirming(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restore version {confirming}?</DialogTitle>
            <DialogDescription>
              This saves the lines of version {confirming} as a new version on
              top of v{current}. Earlier versions stay in the history.
            </DialogDescription>
          </DialogHeader>
          {conflict && (
            <div role="alert" className="text-sm">
              <p className="text-destructive">
                This formulation was changed elsewhere since you opened it.
                Reload the latest version, then try again.
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => {
                  setConfirming(null);
                  setConflict(false);
                  useFormulationStore.getState().requestReload();
                }}
              >
                Reload latest
              </Button>
            </div>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter showCloseButton>
            <Button disabled={pending} onClick={() => void restore()}>
              {pending ? "Restoring…" : "Restore"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
