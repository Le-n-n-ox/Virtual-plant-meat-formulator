"use client";

import { Fragment, useEffect, useState, type ReactNode } from "react";
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  Loader2Icon,
  SparklesIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  explainCandidate,
  explainJob,
  explainModel,
  getAssistantStatus,
  type AssistantExplanation,
  type AssistantStatus,
} from "@/lib/api/assistant";
import { ApiError } from "@/lib/api/client";

export type ExplainTarget =
  | { kind: "job"; id: string }
  | { kind: "candidate"; id: string }
  | { kind: "model"; id: string };

// One status request per page load, shared by every panel.
let statusPromise: Promise<AssistantStatus | null> | null = null;
function assistantStatus(): Promise<AssistantStatus | null> {
  statusPromise ??= getAssistantStatus().catch(() => {
    statusPromise = null; // allow a retry on the next mount
    return null;
  });
  return statusPromise;
}

function explain(target: ExplainTarget, question?: string) {
  const body = question?.trim() ? { question: question.trim() } : {};
  if (target.kind === "job") return explainJob(target.id, body);
  if (target.kind === "candidate") return explainCandidate(target.id, body);
  return explainModel(target.id, body);
}

function errorText(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "dependency_unavailable")
      return "The explanation service is unavailable right now. Try again shortly.";
    if (error.code === "result_not_ready")
      return "This result is not ready yet; explanations are available once the job completes.";
    if (error.code === "rate_limited")
      return "Too many explanation requests; wait a minute and try again.";
    return error.message;
  }
  return "The explanation could not be generated.";
}

/** Render **bold** spans and line breaks from the model's plain-text reply. */
function renderText(text: string): ReactNode {
  return text.split("\n").map((line, i) => (
    <Fragment key={i}>
      {i > 0 && <br />}
      {line
        .split(/(\*\*[^*]+\*\*)/g)
        .map((part, j) =>
          part.startsWith("**") && part.endsWith("**") && part.length > 4 ? (
            <strong key={j}>{part.slice(2, -2)}</strong>
          ) : (
            <Fragment key={j}>{part.replace(/^#{1,6}\s+/, "")}</Fragment>
          ),
        )}
    </Fragment>
  ));
}

/**
 * "Explain this result": asks the hosted language model to explain a stored
 * result. The model only explains; it never produces scientific values, and
 * the backend flags any number in the reply that is not in the stored data.
 */
export function ExplainPanel({
  target,
  label = "Explain this result",
}: {
  target: ExplainTarget;
  label?: string;
}) {
  const [status, setStatus] = useState<AssistantStatus | null | undefined>();
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  // Explanations are keyed to their target so a new job/model never shows a stale one.
  const key = `${target.kind}:${target.id}`;
  const [outcome, setOutcome] = useState<{
    key: string;
    result: AssistantExplanation | null;
    error: string | null;
  }>({ key, result: null, error: null });
  const result = outcome.key === key ? outcome.result : null;
  const error = outcome.key === key ? outcome.error : null;

  useEffect(() => {
    let alive = true;
    void assistantStatus().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);

  if (status === undefined) return null;
  if (!status?.configured) {
    return (
      <p className="text-xs text-muted-foreground">
        AI explanations are off: no language model is configured on the server.
      </p>
    );
  }

  const run = async () => {
    setLoading(true);
    setOutcome({ key, result: null, error: null });
    try {
      setOutcome({ key, result: await explain(target, question), error: null });
    } catch (e) {
      setOutcome({ key, result: null, error: errorText(e) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <section
      aria-label="AI explanation"
      className="flex flex-col gap-2 rounded-lg border border-dashed p-3"
    >
      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run();
        }}
      >
        <Input
          aria-label="Question for the AI explanation (optional)"
          placeholder="Optional question, e.g. why is this amino acid limiting?"
          value={question}
          maxLength={500}
          onChange={(e) => setQuestion(e.target.value)}
          className="min-w-56 flex-1"
          disabled={loading}
        />
        <Button type="submit" size="sm" variant="outline" disabled={loading}>
          {loading ? (
            <Loader2Icon aria-hidden className="animate-spin" />
          ) : (
            <SparklesIcon aria-hidden />
          )}
          {loading ? "Explaining…" : label}
        </Button>
      </form>
      {loading && (
        <p className="text-xs text-muted-foreground">
          The reasoning model can take up to a minute.
        </p>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
      {result && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">
              AI explanation — not a measurement
            </Badge>
            {result.numbers_check.passed ? (
              <Badge variant="outline" className="gap-1">
                <CheckCircle2Icon aria-hidden className="size-3" />
                Numbers match stored data
              </Badge>
            ) : (
              <Badge variant="destructive" className="gap-1">
                <AlertTriangleIcon aria-hidden className="size-3" />
                Unverified numbers:{" "}
                {result.numbers_check.unverified_numbers.join(", ")}
              </Badge>
            )}
          </div>
          <div className="text-sm leading-relaxed">
            {renderText(result.text)}
          </div>
          {!result.numbers_check.passed && (
            <p className="text-xs text-destructive">
              Some numbers in this explanation do not appear in the stored
              result. Trust the result tables, not these figures.
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {result.disclaimer} · {result.model}
          </p>
        </div>
      )}
    </section>
  );
}
