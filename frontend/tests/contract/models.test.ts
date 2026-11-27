import { beforeAll, describe, expect, it } from "vitest";
import {
  approveModel,
  getModel,
  listModels,
  retireModel,
} from "@/lib/api/models";
import {
  modelDetailSchema,
  modelListItemSchema,
  pagedSchema,
} from "@/lib/validation/schemas";
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  contractAvailable,
  expectParses,
  signIn,
  signInAs,
} from "./helpers";

describe.skipIf(!contractAvailable)("models contract", () => {
  beforeAll(signIn);

  it("GET /api/models returns a page", async () => {
    const page = await listModels({ status: "all", page_size: 100 });
    expectParses(pagedSchema(modelListItemSchema), page, "GET /api/models");
  });

  it("GET /api/models/{id} returns the full record", async () => {
    const page = await listModels({ status: "all", page_size: 1 });
    const first = page.items[0];
    expect(first, "no models are registered; train one first").toBeTruthy();
    expectParses(
      modelDetailSchema,
      await getModel(first.id),
      "GET /api/models/{id}",
    );
  });

  it("POST /api/admin/models/{id}/approve and /retire", async () => {
    const page = await listModels({ status: "all", page_size: 100 });
    const candidate = page.items.find((m) => m.status === "candidate");
    // Approval needs a trained candidate model and an admin account; skip
    // rather than fail when either is absent.
    if (!candidate || !ADMIN_EMAIL || !ADMIN_PASSWORD) return;
    await signInAs(ADMIN_EMAIL, ADMIN_PASSWORD);
    expectParses(
      modelDetailSchema,
      await approveModel(candidate.id),
      "POST /api/admin/models/{id}/approve",
    );
    expectParses(
      modelDetailSchema,
      await retireModel(candidate.id),
      "POST /api/admin/models/{id}/retire",
    );
  });
});
