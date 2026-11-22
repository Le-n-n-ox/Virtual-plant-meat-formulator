"use client";

import { PlusIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiQuery } from "@/hooks/use-api-query";
import {
  getFormulation,
  listFormulations,
  saveFormulation,
} from "@/lib/api/formulations";
import { errorMessage, formatDateTime } from "@/lib/format";
import { useInvalidateResource } from "@/lib/query/invalidate";
import type { Ingredient } from "@/types";

/**
 * "Add to formulation" (guide §5 page 4). The ingredient lands at 0% so it is
 * present in the draft without inventing a proportion, then the user is taken
 * to the editor where the percentage is actually chosen.
 */
export function AddToFormulation({ ingredient }: { ingredient: Ingredient }) {
  const router = useRouter();
  const invalidate = useInvalidateResource();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /** The list is only fetched once the picker opens. */
  const {
    data,
    error: listError,
    loading,
  } = useApiQuery(
    ["formulations", { page_size: 25 }],
    () => listFormulations({ page_size: 25 }),
    open,
  );

  async function choose(id: string) {
    setBusy(id);
    setError(null);
    try {
      const formulation = await getFormulation(id);
      const lines = [
        ...formulation.lines,
        { ingredient_id: ingredient.id, percent: 0 },
      ];
      await saveFormulation(id, {
        base_version: formulation.version,
        lines,
      });
      invalidate("formulations");
      // The workspace loads the formulation itself from the API.
      router.push(`/formulations/${id}`);
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(null);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setError(null);
          setBusy(null);
        }
      }}
    >
      <Button onClick={() => setOpen(true)}>
        <PlusIcon className="size-4" aria-hidden /> Add to formulation
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add “{ingredient.common_name}”</DialogTitle>
          <DialogDescription>
            Added at 0%, then set the proportion in the editor.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {listError ? (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(listError)}
          </p>
        ) : loading ? (
          <Skeleton className="h-40 w-full" />
        ) : !data || data.items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You have no formulations yet. Create one from the formulations page.
          </p>
        ) : (
          <ul className="flex max-h-80 flex-col gap-1 overflow-auto">
            {data.items.map((f) => (
              <li key={f.id}>
                <Button
                  variant="outline"
                  className="w-full justify-start"
                  disabled={busy !== null}
                  onClick={() => choose(f.id)}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{f.name}</span>
                    <span className="block text-xs text-muted-foreground">
                      v{f.current_version} · updated{" "}
                      {formatDateTime(f.updated_at)}
                    </span>
                  </span>
                  {busy === f.id && (
                    <span className="ml-2 shrink-0 text-xs">Adding…</span>
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
