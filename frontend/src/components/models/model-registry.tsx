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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
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
import { useInvalidateResource } from "@/lib/query/invalidate";
import type { ModelDetail } from "@/types";

type Action = { kind: "approve" | "retire"; model: ModelListItem };

export function ModelRegistry() {
  const { user } = useAuth();
  const isAdmin = user.role === "admin";
  const invalidate = useInvalidateResource();
  const { data, error, loading } = useApiQuery(
    ["models", { status: "all", page_size: 100 }],
    () => listModels({ status: "all", page_size: 100 }),
  );
  const [action, setAction] = useState<Action | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
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
      invalidate("models");
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setPending(false);
    }
  }

  const openModel = data?.items.find((m) => m.id === openId) ?? null;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 p-4 sm:p-6 lg:p-8">
      <header>
        <h1 className="text-h1">Model registry</h1>
        <p className="text-small text-muted-foreground">
          Texture models trained on literature data. Only an approved model can
          be used for predictions, and every prediction is a literature-derived
          estimate.
        </p>
      </header>

      {error ? (
        <p role="alert" className="text-small text-destructive">
          {errorMessage(error)}
        </p>
      ) : loading ? (
        <Skeleton className="h-48 w-full" />
      ) : data && data.items.length === 0 ? (
        <p className="rounded-lg border border-dashed p-8 text-center text-small text-muted-foreground">
          No models have been trained yet.
        </p>
      ) : (
        <ul className="flex flex-col gap-3">
          {data?.items.map((m) => (
            <ModelCard
              key={m.id}
              model={m}
              isAdmin={isAdmin}
              onOpen={() => setOpenId(m.id)}
              onAction={(kind) => {
                setActionError(null);
                setAction({ kind, model: m });
              }}
            />
          ))}
        </ul>
      )}

      {openModel && (
        <ModelDetailSheet model={openModel} onClose={() => setOpenId(null)} />
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
            <p className="text-small">
              {humanizeKey(action.model.target)} · {action.model.algorithm} v
              {action.model.version}
            </p>
          )}
          {actionError && (
            <p role="alert" className="text-small text-destructive">
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
  onOpen,
  onAction,
}: {
  model: ModelListItem;
  isAdmin: boolean;
  onOpen: () => void;
  onAction: (kind: "approve" | "retire") => void;
}) {
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
        <CardContent className="flex flex-col gap-3 text-small">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1">
            <dt className="text-muted-foreground">
              Holdout {rmse ? rmse.name.toUpperCase() : "error"}
            </dt>
            <dd className="font-numeric">
              {rmse
                ? `${formatNumber(rmse.value)}${model.unit ? ` ${model.unit}` : ""}`
                : "not reported"}
            </dd>
            <dt className="text-muted-foreground">Training set size</dt>
            <dd className="font-numeric">{model.training_set_size} samples</dd>
            <dt className="text-muted-foreground">Dataset</dt>
            <dd>{model.dataset_version}</dd>
          </dl>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={onOpen}>
              Details and limitations
            </Button>
            {isAdmin && (
              <>
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
              </>
            )}
          </div>
          <ExplainPanel
            target={{ kind: "model", id: model.id }}
            label="Explain this model"
          />
        </CardContent>
      </Card>
    </li>
  );
}

/** Drawer with the model's limitations and the dataset version it used. */
function ModelDetailSheet({
  model,
  onClose,
}: {
  model: ModelListItem;
  onClose: () => void;
}) {
  const detail = useApiQuery(["models", model.id], () => getModel(model.id));
  const record: ModelDetail | null = detail.data;
  const limitations = record
    ? Array.isArray(record.limitations)
      ? record.limitations
      : record.limitations
        ? [record.limitations]
        : []
    : [];
  const domain = record?.applicability_domain ?? {};

  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>
            {humanizeKey(model.target)} · {humanizeKey(model.algorithm)} v
            {model.version}
          </SheetTitle>
          <SheetDescription>
            {model.status}
            {model.approved_at
              ? ` · approved ${formatDateTime(model.approved_at)}`
              : ""}
          </SheetDescription>
        </SheetHeader>

        {detail.loading ? (
          <Skeleton className="h-40 w-full" />
        ) : detail.error ? (
          <p role="alert" className="text-small text-destructive">
            {errorMessage(detail.error)}
          </p>
        ) : (
          <div className="flex flex-col gap-4 text-small">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-caption">
              <dt className="text-muted-foreground">Dataset version</dt>
              <dd>{record?.dataset_version ?? model.dataset_version}</dd>
              <dt className="text-muted-foreground">Unit</dt>
              <dd>{record?.unit ?? "not reported"}</dd>
              <dt className="text-muted-foreground">Interval level</dt>
              <dd className="font-numeric">
                {record?.interval_level === undefined
                  ? "not reported"
                  : `${Math.round(record.interval_level * 100)}%`}
              </dd>
              <dt className="text-muted-foreground">Training set size</dt>
              <dd className="font-numeric">
                {model.training_set_size} samples
              </dd>
            </dl>

            {Object.keys(domain).length > 0 && (
              <section>
                <h3 className="text-caption font-medium text-muted-foreground">
                  Applicability domain
                </h3>
                <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-caption">
                  {Object.entries(domain).map(([key, value]) => (
                    <div key={key} className="contents">
                      <dt className="text-muted-foreground">
                        {humanizeKey(key)}
                      </dt>
                      <dd className="font-numeric">
                        {typeof value === "number"
                          ? formatNumber(value)
                          : JSON.stringify(value)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}

            <section>
              <h3 className="text-caption font-medium text-muted-foreground">
                Limitations
              </h3>
              {limitations.length === 0 ? (
                <p className="mt-1 text-caption">none recorded</p>
              ) : (
                <ul className="mt-1 list-disc pl-4 text-caption">
                  {limitations.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
