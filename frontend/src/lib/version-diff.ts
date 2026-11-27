import type { FormulationLine } from "@/types";

/**
 * Diff between two saved versions of a formulation (guide §5 page 12).
 *
 * Pure on purpose: the tab owns fetching and naming, this only decides what
 * changed. An ingredient present on one side only is added or removed; present
 * on both with a different percentage is changed.
 */
export type VersionChangeKind = "added" | "removed" | "changed";

export interface VersionChange {
  ingredientId: string;
  kind: VersionChangeKind;
  fromPercent: number | null;
  toPercent: number | null;
}

export interface VersionDiff {
  added: VersionChange[];
  removed: VersionChange[];
  changed: VersionChange[];
}

function samePercent(a: number, b: number): boolean {
  // An unset percentage is NaN; two NaNs are the same (unset) value.
  if (Number.isNaN(a) && Number.isNaN(b)) return true;
  return a === b;
}

export function diffVersionLines(
  from: FormulationLine[],
  to: FormulationLine[],
): VersionDiff {
  const before = new Map(from.map((l) => [l.ingredient_id, l.percent]));
  const after = new Map(to.map((l) => [l.ingredient_id, l.percent]));

  const added: VersionChange[] = [];
  const removed: VersionChange[] = [];
  const changed: VersionChange[] = [];

  for (const ingredientId of new Set([...before.keys(), ...after.keys()])) {
    const a = before.get(ingredientId);
    const b = after.get(ingredientId);

    if (a === undefined && b !== undefined) {
      added.push({
        ingredientId,
        kind: "added",
        fromPercent: null,
        toPercent: b,
      });
    } else if (b === undefined && a !== undefined) {
      removed.push({
        ingredientId,
        kind: "removed",
        fromPercent: a,
        toPercent: null,
      });
    } else if (a !== undefined && b !== undefined && !samePercent(a, b)) {
      changed.push({
        ingredientId,
        kind: "changed",
        fromPercent: a,
        toPercent: b,
      });
    }
  }

  const byId = (x: VersionChange, y: VersionChange) =>
    x.ingredientId.localeCompare(y.ingredientId);
  added.sort(byId);
  removed.sort(byId);
  changed.sort(byId);

  return { added, removed, changed };
}

export function isEmptyDiff(diff: VersionDiff): boolean {
  return (
    diff.added.length === 0 &&
    diff.removed.length === 0 &&
    diff.changed.length === 0
  );
}
