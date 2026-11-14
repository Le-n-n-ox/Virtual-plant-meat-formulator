import { AlertTriangleIcon } from "lucide-react";
import { ApiError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

interface ApiErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  /** Overrides the headline when the failure has a known meaning. */
  title?: string;
}

/**
 * One shared error surface for API failures. Shows the message, the error code
 * and an optional retry, so pages do not each invent their own copy.
 */
export function ApiErrorState({ error, onRetry, title }: ApiErrorStateProps) {
  if (!error) return null;

  const apiError = error instanceof ApiError ? error : null;
  const status = apiError?.status;
  const message =
    apiError?.message ??
    (error instanceof Error ? error.message : String(error));

  const headline =
    title ??
    (status === 404
      ? "This data is not available yet."
      : status === 502
        ? "The server response was not valid."
        : "We could not load this data.");

  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-warning/15 text-warning">
          <AlertTriangleIcon className="size-5" aria-hidden />
        </span>
        <div className="space-y-1">
          <p className="font-medium">{headline}</p>
          <p className="text-sm text-muted-foreground">{message}</p>
          {apiError?.code && (
            <p className="text-xs text-muted-foreground">
              Code: <span className="font-mono">{apiError.code}</span>
              {apiError.requestId ? ` · ${apiError.requestId}` : ""}
            </p>
          )}
        </div>
        {onRetry && (
          <Button variant="outline" onClick={onRetry}>
            Try again
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
