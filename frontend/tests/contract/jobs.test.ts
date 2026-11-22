import { beforeAll, describe, it } from "vitest";
import { ApiError } from "@/lib/api/client";
import {
  cancelJob,
  getJob,
  getJobResult,
  getStreamToken,
  listJobs,
  startJob,
  trainModel,
} from "@/lib/api/jobs";
import {
  cancelResponseSchema,
  jobCreatedSchema,
  jobListItemSchema,
  jobStatusResponseSchema,
  nutritionResultSchema,
  pagedSchema,
  streamTokenSchema,
} from "@/lib/validation/schemas";
import type { Formulation } from "@/types";
import { testFormulation } from "./context";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  contractAvailable,
  expectParses,
  signIn,
  signInAs,
  waitForFinish,
} from "./helpers";

describe.skipIf(!contractAvailable)("jobs contract", () => {
  let formulation: Formulation;
  let jobId: string;

  beforeAll(async () => {
    await signIn();
    formulation = await testFormulation();
    const created = await startJob(formulation.id, { type: "nutrition" });
    expectParses(jobCreatedSchema, created, "POST /api/formulations/{id}/jobs");
    jobId = created.job_id;
  }, 120_000);

  it("GET /api/jobs returns a page", async () => {
    expectParses(
      pagedSchema(jobListItemSchema),
      await listJobs({ page_size: 5 }),
      "GET /api/jobs",
    );
  });

  it("GET /api/jobs/{id}", async () => {
    expectParses(
      jobStatusResponseSchema,
      await getJob(jobId),
      "GET /api/jobs/{id}",
    );
  });

  it("POST /api/jobs/{id}/stream-token", async () => {
    expectParses(
      streamTokenSchema,
      await getStreamToken(jobId),
      "POST /api/jobs/{id}/stream-token",
    );
  });

  it("GET /api/jobs/{id}/result returns the stored nutrition payload", async () => {
    const job = await waitForFinish(jobId);
    if (job.status !== "completed") {
      throw new Error(
        `the nutrition job ended as ${job.status}: ${job.message ?? "no message"}`,
      );
    }
    expectParses(
      nutritionResultSchema,
      await getJobResult(jobId),
      "GET /api/jobs/{id}/result",
    );
  }, 120_000);

  it("POST /api/jobs/{id}/cancel", async () => {
    try {
      expectParses(
        cancelResponseSchema,
        await cancelJob(jobId),
        "POST /api/jobs/{id}/cancel",
      );
    } catch (error) {
      // A fast job can finish between the status check and the cancel.
      if (error instanceof ApiError && error.code === "job_already_finished") {
        return;
      }
      throw error;
    }
  });

  it("POST /api/admin/models/train starts a training job", async () => {
    // Training is admin-only; without admin credentials there is nothing to
    // assert against.
    if (!ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    await signInAs(ADMIN_EMAIL, ADMIN_PASSWORD);
    expectParses(
      jobCreatedSchema,
      await trainModel({ target: "hardness" }),
      "POST /api/admin/models/train",
    );
  }, 120_000);
});
