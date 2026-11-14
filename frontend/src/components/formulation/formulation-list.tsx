"use client";

import { PlusIcon, SearchIcon } from "lucide-react";
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
import { createFormulation, listFormulations } from "@/lib/api/formulations";
import { errorMessage, formatDateTime, humanizeKey } from "@/lib/format";

const PAGE_SIZE = 20;

export function FormulationList() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const q = useDebouncedValue(search.trim(), 300);

  const { data, error, loading } = useApiQuery(`list|${q}|${page}`, () =>
    listFormulations({ q: q || undefined, page, page_size: PAGE_SIZE }),
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

      <div className="relative max-w-sm">
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
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.items.map((f) => (
              <TableRow key={f.id}>
                <TableCell className="font-medium">
                  <Link
                    href={`/formulations/${f.id}`}
                    className="text-primary underline-offset-4 hover:underline"
                  >
                    {f.name}
                  </Link>
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
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const created = await createFormulation({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      router.push(`/formulations/${created.id}`);
    } catch (e) {
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
