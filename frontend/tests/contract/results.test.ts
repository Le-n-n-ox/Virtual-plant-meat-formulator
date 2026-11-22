import { beforeAll, describe, it } from "vitest";
import { getNutrition } from "@/lib/api/results";
import { getJobResult, listJobs, startJob } from "@/lib/api/jobs";
import {
  jobCreatedSchema,
  nutritionResultSchema,
  textureResultSchema,
} from "@/lib/validation/schemas";
import type { Formulation } from "@/types";
import { testFormulation } from "./context";
import {
  contractAvailable,
  expectParses,
  signIn,
  waitForFinish,
} from "./helpers";

describe.skipIf(!contractAvailable)("results contract", () => {
  let formulation: Formulation;
  let jobId: string;

  beforeAll(async () => {
    await signIn();
    formulation = await testFormulation();
    // Nutrition is a stored result, so a job has to run before there is one.
    const created = await startJob(formulation.id, { type: "nutrition" });
    expectParses(jobCreatedSchema, created, "POST /api/formulations/{id}/jobs");
    jobId = created.job_id;
  }, 120_000);

  it("GET /api/formulations/{id}/nutrition", async () => {
    const job = await waitForFinish(jobId);
    if (job.status !== "completed") {
      throw new Error(
        `the nutrition job ended as ${job.status}: ${job.message ?? "no message"}`,
      );
    }
    expectParses(
      nutritionResultSchema,
      await getNutrition(formulation.id),
      "GET /api/formulations/{id}/nutrition",
    );
  }, 120_000);

  it("GET /api/jobs/{id}/result returns a stored texture payload", async () => {
    const completed = await listJobs({
      type: "texture_prediction",
      status: ["completed"],
      page_size: 5,
    });
    const newest = completed.items[0];
    // Without an approved texture model no texture job can complete.
    if (!newest) return;
    expectParses(
      textureResultSchema,
      await getJobResult(newest.id),
      "GET /api/jobs/{id}/result (texture_prediction)",
    );
  });
});
