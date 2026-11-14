"use client";

import { useParams } from "next/navigation";
import { useFormulationStore } from "@/stores/formulationStore";

/** Formulation id and the saved version the workspace tabs operate on. */
export function useSavedVersion() {
  const { id } = useParams<{ id: string }>();
  const version = useFormulationStore((s) => s.version);
  const loadState = useFormulationStore((s) => s.loadState);
  const loadedId = useFormulationStore((s) => s.formulationId);
  const ready = loadState === "ready" && loadedId === id && version > 0;
  return { id, version, loadState, ready };
}
