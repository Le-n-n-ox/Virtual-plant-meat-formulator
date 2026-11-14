"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CreateFormulationInput,
  FormulationLine,
  JobType,
  UpdateFormulationInput,
} from "@/types";
import {
  cancelJob,
  getJob,
  getJobEventsUrl,
  getJobResult,
  listJobs,
  startJob,
  type JobListParams,
} from "@/lib/api/jobs";
import {
  createFormulation,
  getFormulation,
  getVersion,
  listFormulations,
  listVersions,
  updateFormulation,
  validateFormulation,
  type FormulationListParams,
} from "@/lib/api/formulations";
import { getIngredient, getIngredients } from "@/lib/api/ingredients";
import { compareCandidates, getNutrition } from "@/lib/api/results";
import {
  getCandidate,
  getCandidates,
  promoteCandidate,
} from "@/lib/api/candidates";
import { getModel, listModels } from "@/lib/api/models";
import { getHealth } from "@/lib/api/system";

// Query keys are prefixes: invalidating ["formulations"] clears every list and
// detail view without enumerating each key.
export const queryKeys = {
  health: ["health"],
  ingredients: (params: unknown) => ["ingredients", params],
  ingredient: (id: string) => ["ingredients", id],
  formulations: (params: unknown) => ["formulations", params],
  formulation: (id: string) => ["formulations", id],
  versions: (id: string) => ["formulations", id, "versions"],
  version: (id: string, version: number) => [
    "formulations",
    id,
    "versions",
    version,
  ],
  nutrition: (id: string) => ["results", "nutrition", id],
  candidates: (id: string) => ["candidates", id],
  candidate: (id: string) => ["candidates", id],
  compare: (a: string, b: string) => ["compare", a, b],
  models: (params: unknown) => ["models", params],
  model: (id: string) => ["models", id],
  jobs: (params: unknown) => ["jobs", params],
  job: (id: string) => ["jobs", id],
  jobResult: (id: string) => ["jobs", id, "result"],
} as const;

export function useHealth() {
  return useQuery({ queryKey: queryKeys.health, queryFn: getHealth });
}

export function useIngredients(
  params: Parameters<typeof getIngredients>[0] = {},
) {
  return useQuery({
    queryKey: queryKeys.ingredients(params),
    queryFn: () => getIngredients(params),
  });
}

export function useIngredient(id: string) {
  return useQuery({
    queryKey: queryKeys.ingredient(id),
    queryFn: () => getIngredient(id),
    enabled: Boolean(id),
  });
}

export function useFormulations(params: FormulationListParams = {}) {
  return useQuery({
    queryKey: queryKeys.formulations(params),
    queryFn: () => listFormulations(params),
  });
}

export function useFormulation(id: string | null) {
  return useQuery({
    queryKey: queryKeys.formulation(id ?? ""),
    queryFn: () => getFormulation(id as string),
    enabled: Boolean(id),
  });
}

export function useFormulationVersions(id: string | null) {
  return useQuery({
    queryKey: queryKeys.versions(id ?? ""),
    queryFn: () => listVersions(id as string),
    enabled: Boolean(id),
  });
}

export function useVersion(id: string, version: number) {
  return useQuery({
    queryKey: queryKeys.version(id, version),
    queryFn: () => getVersion(id, version),
    enabled: Boolean(id && version),
  });
}

export function useNutrition(id: string | null) {
  return useQuery({
    queryKey: queryKeys.nutrition(id ?? ""),
    queryFn: () => getNutrition(id as string),
    enabled: Boolean(id),
  });
}

export function useCandidates(id: string | null) {
  return useQuery({
    queryKey: queryKeys.candidates(id ?? ""),
    queryFn: () => getCandidates(id as string),
    enabled: Boolean(id),
  });
}

export function useCandidate(id: string | null) {
  return useQuery({
    queryKey: queryKeys.candidate(id ?? ""),
    queryFn: () => getCandidate(id as string),
    enabled: Boolean(id),
  });
}

export function useCompare(a: string | null, b: string | null) {
  return useQuery({
    queryKey: queryKeys.compare(a ?? "", b ?? ""),
    queryFn: () => compareCandidates(a as string, b as string),
    enabled: Boolean(a && b),
  });
}

export function useModels(params: Parameters<typeof listModels>[0] = {}) {
  return useQuery({
    queryKey: queryKeys.models(params),
    queryFn: () => listModels(params),
  });
}

export function useModel(id: string | null) {
  return useQuery({
    queryKey: queryKeys.model(id ?? ""),
    queryFn: () => getModel(id as string),
    enabled: Boolean(id),
  });
}

export function useJobs(params: JobListParams = {}) {
  return useQuery({
    queryKey: queryKeys.jobs(params),
    queryFn: () => listJobs(params),
  });
}

export function useJob(id: string | null) {
  return useQuery({
    queryKey: queryKeys.job(id ?? ""),
    queryFn: () => getJob(id as string),
    enabled: Boolean(id),
  });
}

export function useJobResult(id: string | null) {
  return useQuery({
    queryKey: queryKeys.jobResult(id ?? ""),
    queryFn: () => getJobResult(id as string),
    enabled: Boolean(id),
  });
}

/** EventSource URL for the live job stream. */
export function jobEventsUrl(id: string | null): string | null {
  return id ? getJobEventsUrl(id) : null;
}

// ---------------------------------------------------------------- mutations

function useInvalidatePrefix() {
  const client = useQueryClient();
  return (prefix: readonly unknown[]) =>
    client.invalidateQueries({ queryKey: prefix });
}

export function useCreateFormulation() {
  const invalidate = useInvalidatePrefix();
  return useMutation({
    mutationFn: (input: CreateFormulationInput) => createFormulation(input),
    onSuccess: () => invalidate(["formulations"]),
  });
}

export function useUpdateFormulation() {
  const invalidate = useInvalidatePrefix();
  return useMutation({
    mutationFn: ({
      id,
      input,
    }: {
      id: string;
      input: UpdateFormulationInput;
    }) => updateFormulation(id, input),
    onSuccess: (_data, { id }) => {
      invalidate(["formulations"]);
      invalidate(queryKeys.formulation(id));
      invalidate(queryKeys.versions(id));
    },
  });
}

export function useValidateFormulation() {
  return useMutation({
    mutationFn: ({ id, lines }: { id: string; lines: FormulationLine[] }) =>
      validateFormulation(id, lines),
  });
}

export function useStartJob() {
  const invalidate = useInvalidatePrefix();
  return useMutation({
    mutationFn: ({
      formulationId,
      type,
      params,
    }: {
      formulationId: string;
      type: JobType;
      params?: Record<string, unknown>;
    }) => startJob(formulationId, type, params),
    onSuccess: () => invalidate(["jobs"]),
  });
}

export function useCancelJob() {
  const invalidate = useInvalidatePrefix();
  return useMutation({
    mutationFn: (jobId: string) => cancelJob(jobId),
    onSuccess: () => invalidate(["jobs"]),
  });
}

export function usePromoteCandidate() {
  const invalidate = useInvalidatePrefix();
  return useMutation({
    mutationFn: (candidateId: string) => promoteCandidate(candidateId),
    onSuccess: () => {
      invalidate(["formulations"]);
      invalidate(["candidates"]);
    },
  });
}
