import type { StartErrorInfo } from "@/lib/jobs/start-error";

const TITLES: Record<string, string> = {
  infeasible: "No feasible formulation",
  validation_failed: "The request is not valid",
  missing_ingredient_data: "Ingredient data is missing",
  model_unavailable: "Texture model unavailable",
  job_limit_reached: "Job limit reached",
};

/** Dedicated rendering for start/job errors (issues list, violated constraints). */
export function ErrorBlock({ error }: { error: StartErrorInfo }) {
  const title = TITLES[error.code];
  return (
    <div
      role="alert"
      className="flex flex-col gap-1 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
    >
      {title && <p className="font-medium text-destructive">{title}</p>}
      <p>{error.message}</p>
      {error.issues.length > 0 && (
        <ul className="list-disc pl-5 text-xs">
          {error.issues.map((i, n) => (
            <li key={n}>
              {i.field ? <code className="mr-1">{i.field}</code> : null}
              {i.message}
            </li>
          ))}
        </ul>
      )}
      {error.violated.length > 0 && (
        <>
          <p className="text-xs font-medium">Constraints that cannot be met</p>
          <ul className="list-disc pl-5 text-xs">
            {error.violated.map((v, n) => (
              <li key={n}>{v}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
