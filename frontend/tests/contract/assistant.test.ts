import { beforeAll, describe, expect, it } from "vitest";
import { explainModel, getAssistantStatus } from "@/lib/api/assistant";
import { listModels } from "@/lib/api/models";
import {
  assistantExplanationSchema,
  assistantStatusSchema,
} from "@/lib/validation/schemas";
import { contractAvailable, expectParses, signIn } from "./helpers";

describe.skipIf(!contractAvailable)("assistant contract", () => {
  beforeAll(signIn);

  it("GET /api/assistant/status", async () => {
    expectParses(
      assistantStatusSchema,
      await getAssistantStatus(),
      "GET /api/assistant/status",
    );
  });

  it("POST /api/models/{id}/explain", async () => {
    const status = await getAssistantStatus();
    // The explanation feature is optional; without a configured model the
    // backend answers with an error rather than a payload.
    if (!status.configured) return;

    const page = await listModels({ status: "all", page_size: 1 });
    const first = page.items[0];
    expect(first, "no models are registered").toBeTruthy();
    expectParses(
      assistantExplanationSchema,
      await explainModel(first.id),
      "POST /api/models/{id}/explain",
    );
  });
});
