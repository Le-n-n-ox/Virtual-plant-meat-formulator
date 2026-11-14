import type {
  CreateFormulationInput,
  Formulation,
  FormulationLine,
  FormulationListItem,
  FormulationVersion,
  FormulationVersionDiff,
  Paginated,
  UpdateFormulationInput,
  ValidationResult,
} from "@/types";
import { buildQuery, requestValidated } from "./client";
import {
  createFormulationInputSchema,
  formulationListItemSchema,
  formulationSchema,
  formulationVersionSchema,
  paginatedSchema,
  updateFormulationInputSchema,
  validationResultSchema,
  versionListSchema,
} from "@/lib/validation/schemas";

export type FormulationListParams = {
  q?: string;
  status?: "draft" | "active" | "archived";
  page?: number;
  page_size?: number;
};

export function listFormulations(
  params: FormulationListParams = {},
): Promise<Paginated<FormulationListItem>> {
  return requestValidated(
    `/api/formulations${buildQuery(params as Record<string, string | number | undefined>)}`,
    paginatedSchema(formulationListItemSchema),
  );
}

export function getFormulation(id: string): Promise<Formulation> {
  return requestValidated(
    `/api/formulations/${encodeURIComponent(id)}`,
    formulationSchema,
  );
}

export function createFormulation(
  input: CreateFormulationInput,
): Promise<Formulation> {
  return requestValidated("/api/formulations", formulationSchema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(createFormulationInputSchema.parse(input)),
  });
}

/** Save the draft as a new version. */
export function updateFormulation(
  id: string,
  input: UpdateFormulationInput,
): Promise<Formulation> {
  return requestValidated(
    `/api/formulations/${encodeURIComponent(id)}`,
    formulationSchema,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updateFormulationInputSchema.parse(input)),
    },
  );
}

export function validateFormulation(
  id: string,
  lines: FormulationLine[],
): Promise<ValidationResult> {
  return requestValidated(
    `/api/formulations/${encodeURIComponent(id)}/validate`,
    validationResultSchema,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ lines }),
    },
  );
}

export function listVersions(
  id: string,
): Promise<{ items: FormulationVersion[]; total: number }> {
  return requestValidated(
    `/api/formulations/${encodeURIComponent(id)}/versions`,
    versionListSchema,
  );
}

export function getVersion(
  id: string,
  version: number,
): Promise<FormulationVersion> {
  return requestValidated(
    `/api/formulations/${encodeURIComponent(id)}/versions/${version}`,
    formulationVersionSchema,
  );
}

/** Client-side diff between two saved versions (page 12). */
export function diffVersions(
  from: FormulationVersion,
  to: FormulationVersion,
): FormulationVersionDiff {
  const fromMap = new Map(from.lines.map((l) => [l.ingredient_id, l.percent]));
  const toMap = new Map(to.lines.map((l) => [l.ingredient_id, l.percent]));
  const added = to.lines.filter((l) => !fromMap.has(l.ingredient_id));
  const removed = from.lines.filter((l) => !toMap.has(l.ingredient_id));
  const changed = to.lines
    .filter(
      (l) =>
        fromMap.has(l.ingredient_id) &&
        fromMap.get(l.ingredient_id) !== l.percent,
    )
    .map((l) => ({
      ingredient_id: l.ingredient_id,
      from: fromMap.get(l.ingredient_id)!,
      to: l.percent,
    }));
  return { from: from.version, to: to.version, added, removed, changed };
}
