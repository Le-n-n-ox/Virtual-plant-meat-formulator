import { describe, expect, it } from "vitest";
import { intervalOf } from "@/components/results/texture-interval";
import type { TexturePrediction } from "@/types";

const BASE = {
  target: "hardness",
  value: 12,
  unit: "N",
  model: {
    id: "mdl_1",
    target: "hardness",
    algorithm: "gaussian_process",
    version: "3",
    training_set_size: 64,
  },
};

function prediction(overrides: Record<string, unknown>): TexturePrediction {
  return { ...BASE, ...overrides } as TexturePrediction;
}

describe("intervalOf", () => {
  it("reads a two-element tuple interval", () => {
    expect(intervalOf(prediction({ interval: [10, 14] }))).toEqual([10, 14]);
  });

  it("reads a lower/upper object interval", () => {
    const p = prediction({ interval: { lower: 9.5, upper: 14.5 } });
    expect(intervalOf(p)).toEqual([9.5, 14.5]);
  });

  it("returns null when no interval is reported", () => {
    expect(intervalOf(prediction({}))).toBeNull();
    expect(intervalOf(prediction({ interval: [1] }))).toBeNull();
    expect(intervalOf(prediction({ interval: { lower: 1 } }))).toBeNull();
  });

  it("coerces numeric strings from the API", () => {
    const p = prediction({ interval: ["8", "16"] });
    expect(intervalOf(p)).toEqual([8, 16]);
  });
});
