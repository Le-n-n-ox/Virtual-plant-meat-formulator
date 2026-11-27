import type { ModelDetail, ModelListItem, Paged } from "@/types";
import { buildQuery, requestJson } from "./client";
import {
  modelDetailSchema,
  modelListItemSchema,
  pagedSchema,
} from "@/lib/validation/schemas";

export type ModelStatus = "approved" | "candidate" | "retired" | "all";

export type { ModelListItem };

const base = (id: string) => `/api/models/${encodeURIComponent(id)}`;
const admin = (id: string) => `/api/admin/models/${encodeURIComponent(id)}`;

export function listModels(
  params: {
    target?: string;
    status?: ModelStatus;
    page?: number;
    page_size?: number;
  } = {},
): Promise<Paged<ModelListItem>> {
  return requestJson(
    `/api/models${buildQuery({ ...params })}`,
    undefined,
    pagedSchema(modelListItemSchema),
  );
}

export function getModel(id: string): Promise<ModelDetail> {
  return requestJson(base(id), undefined, modelDetailSchema);
}

export function approveModel(id: string): Promise<ModelDetail> {
  return requestJson(
    `${admin(id)}/approve`,
    { method: "POST" },
    modelDetailSchema,
  );
}

export function retireModel(id: string): Promise<ModelDetail> {
  return requestJson(
    `${admin(id)}/retire`,
    { method: "POST" },
    modelDetailSchema,
  );
}

export const modelsApi = { listModels, getModel, approveModel, retireModel };
export type ModelsApi = typeof modelsApi;
