"use client";

import { ExplainPanel } from "@/components/assistant/explain-panel";
import { useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  approveModel,
  getModel,
  listModels,
  retireModel,
  type ModelListItem,
} from "@/lib/api/models";
import {
  errorMessage,
  formatDateTime,
  formatNumber,
  humanizeKey,
} from "@/lib/format";

type Action = { kind: "approve" | "retire"; model: ModelListItem };

export function ModelRegistry() {
  const { user } = useAuth();
  const isAdmin = user.role === "admin";
  const { data, error, loading, reload } = useApiQuery("models", () =>
    listModels({ status: "all", page_size: 100 }),
  );
  const [action, setAction] = useState<Action | null>(null);
  const [pending, setPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function confirm() {
    if (!action) return;
    setPending(true);
    setActionError(null);
    try {
      if (action.kind === "approve") await approveModel(action.model.id);
      else await retireModel(action.model.id);
      setAction(null);
      reload();
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          Model registry
        </h1>
        <p className="text-sm text-muted-foreground">
          Texture models trained on literature data. Only an approved model can
          be used for predictions, and every prediction is a literature-derived
          estimate.
        </p>
      </header>

      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {errorMessage(error)}
        </p>
      ) : loading ? (
        <Skeleton className="h-48 w-full" />
      ) : data && data.items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
          No models have been trained yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data?.items.map((m) => (
            <ModelCard
              key={m.id}
              model={m}
              isAdmin={isAdmin}
              onAction={(kind) => {
                setActionError(null);
                setAction({ kind, model: m });
              }}
            />
          ))}
        </ul>
      )}

      <Dialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action?.kind === "approve" ? "Approve" : "Retire"} this model?
            </DialogTitle>
            <DialogDescription>
              {action?.kind === "approve"
                ? "Approval is a scientific review decision. Approved models are used for texture predictions shown to every user. Only approve a model after reviewing its holdout error, training data and limitations."
                : "Retiring removes this model from use. Texture predictions will be unavailable for its target unless another model is approved."}
            </DialogDescription>
          </DialogHeader>
          {action && (
            <p className="text-sm">
              {humanizeKey(action.model.target)} · {action.model.algorithm} v
              {action.model.version}
            </p>
          )}
          {actionError && (
            <p role="alert" className="text-sm text-destructive">
              {actionError}
            </p>
          )}
          <DialogFooter showCloseButton>
            <Button
              variant={action?.kind === "retire" ? "destructive" : "default"}
              disabled={pending}
              onClick={() => void confirm()}
            >
              {action?.kind === "approve" ? "Approve model" : "Retire model"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </main>
  );
}

function ModelCard({
  model,
  isAdmin,
  onAction,
}: {
  model: ModelListItem;
  isAdmin: boolean;
  onAction: (kind: "approve" | "retire") => void;
}) {
  const detail = useApiQuery(`model|${model.id}|${model.status}`, () =>
    getModel(model.id),
  );
  const limitations = detail.data?.limitations;
  const rmse = model.holdout_metric;
  return (
    <li>
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2">
            {humanizeKey(model.target)}
            <Badge
              variant={
                model.status === "approved"
                  ? "default"
                  : model.status === "retired"
                    ? "outline"
                    : "secondary"
              }
            >
              {model.status}
            </Badge>
          </CardTitle>
          <CardDescription>
            {model.algorithm} · version {model.version}
            {model.approved_at
              ? ` · approved ${formatDateTime(model.approved_at)}`
              : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 text-sm">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
            <dt className="text-muted-foreground">
              Holdout {rmse ? rmse.name.toUpperCase() : "error"}
            </dt>
            <dd className="tabular-nums">
              {rmse
                ? `${formatNumber(rmse.value)}${model.unit ? ` ${model.unit}` : ""}`
                : "not reported"}
            </dd>
            <dt className="text-muted-foreground">Training set size</dt>
            <dd className="tabular-nums">{model.training_set_size} samples</dd>
            <dt className="text-muted-foreground">Dataset</dt>
            <dd>{model.dataset_version}</dd>
          </dl>
          <div>
            <h3 className="text-xs font-medium text-muted-foreground">
              Limitations
            </h3>
            {detail.loading ? (
              <Skeleton className="mt-1 h-10 w-full" />
            ) : detail.error ? (
              <p className="text-xs text-destructive">
                {errorMessage(detail.error)}
              </p>
            ) : Array.isArray(limitations) ? (
              <ul className="list-disc pl-4 text-xs">
                {limitations.map((l) => (
                  <li key={l}>{l}</li>
                ))}
              </ul>
            ) : (
              <p className="text-xs">{limitations || "none recorded"}</p>
            )}
          </div>
          <ExplainPanel
            target={{ kind: "model", id: model.id }}
            label="Explain this model"
          />
          {isAdmin && (
            <div className="flex gap-2">
              {model.status !== "approved" && (
                <Button size="sm" onClick={() => onAction("approve")}>
                  Approve
                </Button>
              )}
              {model.status !== "retired" && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onAction("retire")}
                >
                  Retire
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </li>
  );
}
