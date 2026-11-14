import { describe, expect, it } from "vitest";
import {
  ingredientListItemSchema,
  jobEventSchema,
  paginatedSchema,
  validationResultSchema,
} from "@/lib/validation/schemas";

const ingredient = {
  id: "test-cowpea-raw",
  scientific_name: "Vigna unguiculata",
  common_name: "Cowpea, raw",
  form: "raw",
  moisture_basis: "as sold",
  source: { id: "test-source", name: "Test reference" },
  protein_g_per_100g: 24.5,
  has_amino_acids: true,
};

describe("response schemas", () => {
  it("accepts a valid catalogue row", () => {
    const parsed = ingredientListItemSchema.safeParse(ingredient);
    expect(parsed.success).toBe(true);
  });

  it("rejects a catalogue row without its required flags", () => {
    const broken = { ...ingredient };
    delete (broken as Partial<typeof broken>).has_amino_acids;
    expect(ingredientListItemSchema.safeParse(broken).success).toBe(false);
  });

  it("validates a paginated envelope", () => {
    const schema = paginatedSchema(ingredientListItemSchema);
    const parsed = schema.safeParse({
      items: [ingredient],
      total: 1,
      page: 1,
      page_size: 25,
    });
    expect(parsed.success).toBe(true);
  });

  it("keeps null nutrient values instead of coercing to zero", () => {
    const parsed = validationResultSchema.safeParse({
      valid: false,
      total_percent: 90,
      issues: [{ code: "total_not_100", message: "Test issue." }],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown job event name", () => {
    const parsed = jobEventSchema.safeParse({
      job_id: "test-job-1",
      event: "made.up.event",
      status: "running",
      stage: "mixing",
      stage_label: "Preparing formulation",
      progress_percent: null,
      candidate_id: null,
      timestamp: "2026-11-14T00:00:00Z",
    });
    expect(parsed.success).toBe(false);
  });
});
