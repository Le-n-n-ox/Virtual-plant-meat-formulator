import type { ModelRecord, Paginated } from "@/types";
import { buildQuery, requestValidated } from "./client";
import { modelRecordSchema, paginatedSchema } from "@/lib/validation/schemas";

export type ModelListParams = {
  target?: string;
  page?: number;
  page_size?: number;
};

export function listModels(
  params: ModelListParams = {},
): Promise<Paginated<ModelRecord>> {
  return requestValidated(
    `/api/models${buildQuery(params as Record<string, string | number | undefined>)}`,
    paginatedSchema(modelRecordSchema),
  );
}

export function getModel(id: string): Promise<ModelRecord> {
  return requestValidated(
    `/api/models/${encodeURIComponent(id)}`,
    modelRecordSchema,
  );
}
