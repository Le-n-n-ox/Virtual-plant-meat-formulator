import type { ExportFormat } from "@/types";
import { API_BASE_URL, ApiError } from "./client";

/** Download the formulation summary. Returns the raw file blob. */
export async function exportFormulation(
  formulationId: string,
  format: ExportFormat,
): Promise<Blob> {
  const response = await fetch(
    `${API_BASE_URL}/api/formulations/${encodeURIComponent(formulationId)}/export?format=${format}`,
    { headers: { Accept: format === "csv" ? "text/csv" : "application/pdf" } },
  );

  if (!response.ok) {
    throw new ApiError(
      "The export could not be generated.",
      response.status,
      "export_failed",
      { format },
      response.headers.get("X-Request-Id") ?? undefined,
    );
  }

  return response.blob();
}
