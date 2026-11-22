import { describe, expect, it } from "vitest";
import { diffVersionLines, isEmptyDiff } from "@/lib/version-diff";

const line = (ingredient_id: string, percent: number) => ({
  ingredient_id,
  percent,
});

describe("diffVersionLines", () => {
  it("reports nothing when the two versions are identical", () => {
    const diff = diffVersionLines(
      [line("a", 40), line("b", 60)],
      [line("a", 40), line("b", 60)],
    );
    expect(diff).toEqual({ added: [], removed: [], changed: [] });
    expect(isEmptyDiff(diff)).toBe(true);
  });

  it("treats two empty versions as equal", () => {
    expect(isEmptyDiff(diffVersionLines([], []))).toBe(true);
  });

  it("reports an ingredient that only exists in the newer version", () => {
    const diff = diffVersionLines(
      [line("a", 100)],
      [line("a", 80), line("b", 20)],
    );
    expect(diff.added).toEqual([
      { ingredientId: "b", kind: "added", fromPercent: null, toPercent: 20 },
    ]);
    expect(diff.removed).toEqual([]);
    expect(diff.changed).toEqual([
      { ingredientId: "a", kind: "changed", fromPercent: 100, toPercent: 80 },
    ]);
  });

  it("reports an ingredient that only exists in the older version", () => {
    const diff = diffVersionLines(
      [line("a", 60), line("b", 40)],
      [line("a", 60)],
    );
    expect(diff.removed).toEqual([
      { ingredientId: "b", kind: "removed", fromPercent: 40, toPercent: null },
    ]);
    expect(diff.added).toEqual([]);
    expect(diff.changed).toEqual([]);
  });

  it("shows the old and new percentage for a changed ingredient", () => {
    const diff = diffVersionLines([line("a", 30)], [line("a", 70)]);
    expect(diff.changed[0]).toEqual({
      ingredientId: "a",
      kind: "changed",
      fromPercent: 30,
      toPercent: 70,
    });
  });

  it("counts a whole new formulation as added, and an emptied one as removed", () => {
    const added = diffVersionLines([], [line("a", 100)]);
    expect(added.added).toHaveLength(1);
    expect(added.removed).toHaveLength(0);

    const removed = diffVersionLines([line("a", 100)], []);
    expect(removed.removed).toHaveLength(1);
    expect(removed.added).toHaveLength(0);
  });

  it("does not treat an unset percentage on both sides as a change", () => {
    const diff = diffVersionLines(
      [line("a", Number.NaN)],
      [line("a", Number.NaN)],
    );
    expect(isEmptyDiff(diff)).toBe(true);
  });

  it("does treat an unset percentage becoming a number as a change", () => {
    const diff = diffVersionLines([line("a", Number.NaN)], [line("a", 12)]);
    expect(diff.changed).toEqual([
      {
        ingredientId: "a",
        kind: "changed",
        fromPercent: Number.NaN,
        toPercent: 12,
      },
    ]);
  });

  it("lists each group in a stable order regardless of input order", () => {
    const diff = diffVersionLines(
      [line("z", 10), line("keep", 20), line("m", 5)],
      [line("keep", 20), line("a", 1), line("z", 11)],
    );
    expect(diff.added.map((c) => c.ingredientId)).toEqual(["a"]);
    expect(diff.removed.map((c) => c.ingredientId)).toEqual(["m"]);
    expect(diff.changed.map((c) => c.ingredientId)).toEqual(["z"]);
  });

  it("does not mutate the input lines", () => {
    const from = [line("a", 10)];
    const to = [line("a", 20)];
    diffVersionLines(from, to);
    expect(from).toEqual([line("a", 10)]);
    expect(to).toEqual([line("a", 20)]);
  });
});
