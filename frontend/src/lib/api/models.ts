import type { ModelDetail, ModelMeta, Paged } from "@/types";
import { buildQuery, requestJson } from "./client";

export type ModelStatus = "approved" | "candidate" | "retired" | "all";

export type ModelListItem = ModelMeta & {
  status: string;
  dataset_version: string;
  approved_at: string | null;
  unit?: string;
  interval_level?: number;
};

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
  return requestJson(`/api/models${buildQuery({ ...params })}`);
}

export function getModel(id: string): Promise<ModelDetail> {
  return requestJson(base(id));
}

export function approveModel(id: string): Promise<ModelDetail> {
  return requestJson(`${admin(id)}/approve`, { method: "POST" });
}

export function retireModel(id: string): Promise<ModelDetail> {
  return requestJson(`${admin(id)}/retire`, { method: "POST" });
}

export const modelsApi = { listModels, getModel, approveModel, retireModel };
export type ModelsApi = typeof modelsApi;
