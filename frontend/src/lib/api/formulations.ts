import type {
  Formulation,
  FormulationLine,
  FormulationVersionSummary,
  JobStatus,
  JobType,
  Paged,
  ValidationResult,
} from "@/types";
import { buildQuery, jsonInit, requestJson } from "./client";
import {
  formulationListItemSchema,
  formulationSchema,
  formulationVersionSummarySchema,
  pagedSchema,
  validationResultSchema,
} from "@/lib/validation/schemas";

export interface PagingParams {
  page?: number;
  page_size?: number;
}

export interface FormulationListItem {
  id: string;
  name: string;
  current_version: number;
  last_job: {
    id: string;
    type: JobType | string;
    status: JobStatus;
    finished_at: string | null;
  } | null;
  updated_at: string;
  archived?: boolean;
}

export interface SaveFormulationBody {
  base_version: number;
  name?: string;
  description?: string | null;
  lines: FormulationLine[];
  targets?: Record<string, number>;
  note?: string;
}

const base = (id: string) => `/api/formulations/${encodeURIComponent(id)}`;

export function listFormulations(
  params: { q?: string; archived?: boolean } & PagingParams = {},
): Promise<Paged<FormulationListItem>> {
  return requestJson(
    `/api/formulations${buildQuery({ ...params })}`,
    undefined,
    pagedSchema(formulationListItemSchema),
  );
}

export function createFormulation(body: {
  name: string;
  description?: string;
  template_id?: string;
}): Promise<Formulation> {
  return requestJson(
    "/api/formulations",
    jsonInit("POST", body),
    formulationSchema,
  );
}

export function getFormulation(
  id: string,
  version?: number,
): Promise<Formulation> {
  return requestJson(
    `${base(id)}${buildQuery({ version })}`,
    undefined,
    formulationSchema,
  );
}

export function saveFormulation(
  id: string,
  body: SaveFormulationBody,
): Promise<Formulation> {
  return requestJson(base(id), jsonInit("PUT", body), formulationSchema);
}

export function patchFormulation(
  id: string,
  body: { name?: string; description?: string | null; archived?: boolean },
): Promise<Formulation> {
  return requestJson(base(id), jsonInit("PATCH", body), formulationSchema);
}

export function duplicateFormulation(
  id: string,
  body: { name?: string } = {},
): Promise<Formulation> {
  return requestJson(
    `${base(id)}/duplicate`,
    jsonInit("POST", body),
    formulationSchema,
  );
}

export function validateFormulation(
  id: string,
  body: { lines: FormulationLine[]; targets?: Record<string, number> },
): Promise<ValidationResult> {
  return requestJson(
    `${base(id)}/validate`,
    jsonInit("POST", body),
    validationResultSchema,
  );
}

export function listVersions(
  id: string,
  paging: PagingParams = {},
): Promise<Paged<FormulationVersionSummary>> {
  return requestJson(
    `${base(id)}/versions${buildQuery({ ...paging })}`,
    undefined,
    pagedSchema(formulationVersionSummarySchema),
  );
}

export function getVersion(id: string, version: number): Promise<Formulation> {
  return requestJson(
    `${base(id)}/versions/${version}`,
    undefined,
    formulationSchema,
  );
}

export function restoreVersion(
  id: string,
  version: number,
  body: { base_version: number },
): Promise<Formulation> {
  return requestJson(
    `${base(id)}/versions/${version}/restore`,
    jsonInit("POST", body),
    formulationSchema,
  );
}

export const formulationsApi = {
  listFormulations,
  createFormulation,
  getFormulation,
  saveFormulation,
  patchFormulation,
  duplicateFormulation,
  validateFormulation,
  listVersions,
  getVersion,
  restoreVersion,
};
export type FormulationsApi = typeof formulationsApi;
