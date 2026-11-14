import type { Paged } from "@/types";
import { buildQuery, jsonInit, requestJson } from "./client";

export interface AdminUser {
  user_id: string;
  email: string;
  display_name: string;
  role: string;
  active?: boolean;
  [key: string]: unknown;
}

export type AdminIngredientBody = Record<string, unknown>;

export interface IngredientImportReport {
  import_id: string;
  rows_total?: number;
  rows_valid?: number;
  errors?: { row: number; code?: string; message: string }[];
  duplicates?: unknown[];
  [key: string]: unknown;
}

export interface AuditLogEntry {
  id: string;
  actor?: string | null;
  action: string;
  entity_type?: string;
  entity_id?: string;
  created_at: string;
  [key: string]: unknown;
}

export function listUsers(
  params: { page?: number; page_size?: number } = {},
): Promise<Paged<AdminUser>> {
  return requestJson(`/api/admin/users${buildQuery({ ...params })}`);
}

export function createUser(body: {
  email: string;
  display_name?: string;
  role: string;
  password?: string;
}): Promise<AdminUser> {
  return requestJson("/api/admin/users", jsonInit("POST", body));
}

export function updateUser(
  id: string,
  body: { display_name?: string; role?: string; active?: boolean },
): Promise<AdminUser> {
  return requestJson(
    `/api/admin/users/${encodeURIComponent(id)}`,
    jsonInit("PATCH", body),
  );
}

export function createIngredient(
  body: AdminIngredientBody,
): Promise<Record<string, unknown>> {
  return requestJson("/api/admin/ingredients", jsonInit("POST", body));
}

export function updateIngredient(
  id: string,
  body: AdminIngredientBody,
): Promise<Record<string, unknown>> {
  return requestJson(
    `/api/admin/ingredients/${encodeURIComponent(id)}`,
    jsonInit("PUT", body),
  );
}

export function validateIngredientImport(body: {
  csv: string;
}): Promise<IngredientImportReport> {
  return requestJson("/api/admin/imports/ingredients", jsonInit("POST", body));
}

export function commitIngredientImport(
  importId: string,
): Promise<Record<string, unknown>> {
  return requestJson(
    `/api/admin/imports/${encodeURIComponent(importId)}/commit`,
    { method: "POST" },
  );
}

export function createExperiment(
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return requestJson("/api/admin/experiments", jsonInit("POST", body));
}

export function addSample(
  experimentId: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return requestJson(
    `/api/admin/experiments/${encodeURIComponent(experimentId)}/samples`,
    jsonInit("POST", body),
  );
}

export function addMeasurement(
  sampleId: string,
  body: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return requestJson(
    `/api/admin/samples/${encodeURIComponent(sampleId)}/measurements`,
    jsonInit("POST", body),
  );
}

export function listAuditLog(
  filters: {
    actor?: string;
    action?: string;
    entity_type?: string;
    entity_id?: string;
    since?: string;
    until?: string;
    page?: number;
    page_size?: number;
  } = {},
): Promise<Paged<AuditLogEntry>> {
  return requestJson(`/api/admin/audit-log${buildQuery({ ...filters })}`);
}

export const adminApi = {
  listUsers,
  createUser,
  updateUser,
  createIngredient,
  updateIngredient,
  validateIngredientImport,
  commitIngredientImport,
  createExperiment,
  addSample,
  addMeasurement,
  listAuditLog,
};
export type AdminApi = typeof adminApi;
