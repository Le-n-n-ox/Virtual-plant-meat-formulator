import { buildQuery, requestBlob } from "./client";
import type { ExportFormat } from "@/types";

export type { ExportFormat };

export async function downloadExport(
  formulationId: string,
  format: ExportFormat,
  version?: number,
): Promise<{ blob: Blob; filename: string }> {
  const { blob, filename } = await requestBlob(
    `/api/formulations/${encodeURIComponent(formulationId)}/export${buildQuery({ format, version })}`,
  );
  return {
    blob,
    filename:
      filename ??
      `formulation-${formulationId}${version ? `-v${version}` : ""}.${format}`,
  };
}

/** Triggers a browser download for a Blob (no-op outside the browser). */
export function saveBlob(blob: Blob, filename: string): void {
  if (typeof document === "undefined") return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export const exportsApi = { downloadExport, saveBlob };
export type ExportsApi = typeof exportsApi;
