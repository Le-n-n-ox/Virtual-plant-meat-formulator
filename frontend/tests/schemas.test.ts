import { describe, expect, it } from "vitest";
import {
  ingredientListItemSchema,
  jobEventSchema,
  paginatedSchema,
  validationResultSchema,
} from "@/lib/validation/schemas";
import { MOCK_INGREDIENT_LIST } from "@/mocks/fixtures/catalogue";

describe("response schemas", () => {
  it("accepts a mock catalogue row", () => {
    const parsed = ingredientListItemSchema.safeParse(MOCK_INGREDIENT_LIST[0]);
    expect(parsed.success).toBe(true);
  });

  it("rejects a catalogue row without its required flags", () => {
    const broken = { ...MOCK_INGREDIENT_LIST[0] };
    delete (broken as Partial<typeof broken>).has_amino_acids;
    expect(ingredientListItemSchema.safeParse(broken).success).toBe(false);
  });

  it("validates a paginated envelope", () => {
    const schema = paginatedSchema(ingredientListItemSchema);
    const parsed = schema.safeParse({
      items: MOCK_INGREDIENT_LIST,
      total: MOCK_INGREDIENT_LIST.length,
      page: 1,
      page_size: 25,
    });
    expect(parsed.success).toBe(true);
  });

  it("keeps null nutrient values instead of coercing to zero", () => {
    const parsed = validationResultSchema.safeParse({
      valid: false,
      total_percent: 90,
      issues: [{ code: "total_not_100", message: "Mock issue." }],
    });
    expect(parsed.success).toBe(true);
  });

  it("rejects an unknown job event name", () => {
    const parsed = jobEventSchema.safeParse({
      job_id: "mock-job-1",
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
