"use client";

import {
  ArchiveIcon,
  CopyIcon,
  PlusIcon,
  RotateCcwIcon,
  SearchIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { JobStatusBadge } from "@/components/jobs/job-status";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  createFormulation,
  duplicateFormulation,
  listFormulations,
  patchFormulation,
} from "@/lib/api/formulations";
import { errorMessage, formatDateTime, humanizeKey } from "@/lib/format";
import { useInvalidateResource } from "@/lib/query/invalidate";
import type { FormulationListItem } from "@/types";

const PAGE_SIZE = 20;

export function FormulationList() {
  const router = useRouter();
  const invalidate = useInvalidateResource();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const q = useDebouncedValue(search.trim(), 300);

  const { data, error, loading } = useApiQuery(
    ["formulations", { q, page, showArchived }],
    () =>
      listFormulations({
        q: q || undefined,
        page,
        page_size: PAGE_SIZE,
        archived: showArchived || undefined,
      }),
  );
  const pages = data ? Math.max(1, Math.ceil(data.total / data.page_size)) : 1;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Formulations
          </h1>
          <p className="text-sm text-muted-foreground">
            Your saved blends. Open one to edit, validate and run calculations.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>
          <PlusIcon aria-hidden /> New formulation
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <SearchIcon
            className="pointer-events-none absolute top-2 left-2.5 size-4 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search formulations"
            aria-label="Search formulations"
            className="pl-8"
          />
        </div>
        <label className="flex items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => {
              setShowArchived(e.target.checked);
              setPage(1);
            }}
          />
          Show archived
        </label>
      </div>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : loading ? (
        <Skeleton className="h-48 w-full" />
      ) : data && data.items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          {q
            ? "No formulations match your search."
            : showArchived
              ? "No archived formulations."
              : "No formulations yet. Create one to get started."}
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Last job</TableHead>
              <TableHead>Updated</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.items.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/formulations/${f.id}`}
                    className="text-primary underline underline-offset-4"
                  >
                    {f.name}
                  </Link>
                  {f.archived && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      archived
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  {f.current_version === 0
                    ? "unsaved"
                    : `v${f.current_version}`}
                </TableCell>
                <TableCell>
                  {f.last_job ? (
                    <span className="flex items-center gap-2">
                      <JobStatusBadge status={f.last_job.status} />
                      <span className="text-xs text-muted-foreground">
                        {humanizeKey(String(f.last_job.type))}
                      </span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">No jobs yet</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDateTime(f.updated_at)}
                </TableCell>
                <TableCell className="text-right">
                  <RowActions
                    item={f}
                    onChanged={() => invalidate("formulations")}
                    onDuplicate={(id) => router.push(`/formulations/${id}`)}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {data && data.total > data.page_size && (
        <nav
          aria-label="Pagination"
          className="flex items-center justify-between text-sm"
        >
          <span className="text-muted-foreground">
            Page {data.page} of {pages} · {data.total} formulations
          </span>
          <span className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </Button>
          </span>
        </nav>
      )}

      <NewFormulationDialog open={creating} onOpenChange={setCreating} />
    </main>
  );
}

/**
 * Duplicate and archive for one row. Archiving asks first: it changes what the
 * whole list shows, so it should not happen on a stray click.
 */
function RowActions({
  item,
  onChanged,
  onDuplicate,
}: {
  item: FormulationListItem;
  onChanged: () => void;
  onDuplicate: (id: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function duplicate() {
    setBusy(true);
    setError(null);
    try {
      const copy = await duplicateFormulation(item.id);
      onDuplicate(copy.id);
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }

  async function setArchived(archived: boolean) {
    setBusy(true);
    setError(null);
    try {
      await patchFormulation(item.id, { archived });
      setConfirming(false);
      onChanged();
    } catch (cause) {
      setError(errorMessage(cause));
      setBusy(false);
    }
  }

  return (
    <span className="flex items-center justify-end gap-1">
      <Button
        size="sm"
        variant="outline"
        aria-label={`Duplicate ${item.name}`}
        disabled={busy}
        onClick={duplicate}
      >
        <CopyIcon className="size-3.5" aria-hidden /> Duplicate
      </Button>
      <Button
        size="sm"
        variant="outline"
        aria-label={
          item.archived ? `Restore ${item.name}` : `Archive ${item.name}`
        }
        disabled={busy}
        onClick={() => {
          if (item.archived) void setArchived(false);
          else setConfirming(true);
        }}
      >
        {item.archived ? (
          <>
            <RotateCcwIcon className="size-3.5" aria-hidden /> Restore
          </>
        ) : (
          <>
            <ArchiveIcon className="size-3.5" aria-hidden /> Archive
          </>
        )}
      </Button>

      {error && (
        <span role="alert" className="text-xs text-destructive">
          {error}
        </span>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Archive “{item.name}”?</DialogTitle>
            <DialogDescription>
              It stays in the list under “Show archived”, and its versions are
              kept. You can restore it at any time.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter showCloseButton>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void setArchived(true)}
            >
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </span>
  );
}

export function NewFormulationDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Only fetched once the dialog opens; a failure here does not block creating. */
  const { data: templates, error: templateError } = useApiQuery(
    ["formulations", { page_size: 25 }],
    () => listFormulations({ page_size: 25 }),
    open,
  );

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const created = await createFormulation({
        name: name.trim(),
        description: description.trim() || undefined,
        template_id: templateId || undefined,
      });
      router.push(`/formulations/${created.id}`);
    } catch (e) {
      // The dialog stays open so the name and description are not lost.
      setError(errorMessage(e));
      setPending(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={onSubmit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>New formulation</DialogTitle>
            <DialogDescription>
              Give it a name; you add ingredients in the workspace.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-name">Name</Label>
            <Input
              id="new-name"
              value={name}
              required
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-description">Description (optional)</Label>
            <Input
              id="new-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="new-template">Start from (optional)</Label>
            <select
              id="new-template"
              className="h-9 rounded-lg border bg-background px-2 text-sm"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              disabled={pending}
            >
              <option value="">Blank formulation</option>
              {templates?.items.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} (v{f.current_version})
                </option>
              ))}
            </select>
            {templateError && (
              <p className="text-xs text-muted-foreground">
                Could not list formulations to copy from.
              </p>
            )}
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter showCloseButton>
            <Button type="submit" disabled={pending || !name.trim()}>
              Create
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
