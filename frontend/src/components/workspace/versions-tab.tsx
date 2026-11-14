"use client";

import { RotateCcwIcon } from "lucide-react";
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
import { cn } from "@/lib/utils";
import { useFormulationStore } from "@/stores/formulationStore";
import { useResultStore } from "@/stores/resultStore";

export function VersionsTab() {
  const { id, version: current, ready, loadState } = useSavedVersion();
  const [viewing, setViewing] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const versions = useApiQuery(
    `versions|${id}|${current}`,
    () => listVersions(id, { page_size: 100 }),
    ready,
  );
  const detail = useApiQuery(
    `version-detail|${id}|${viewing}`,
    () => getVersion(id, viewing ?? 1),
    ready && viewing !== null,
  );
  const nameOf = useIngredientNames(
    detail.data?.lines.map((l) => l.ingredient_id) ?? [],
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
                      className="underline-offset-4 hover:underline"
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
