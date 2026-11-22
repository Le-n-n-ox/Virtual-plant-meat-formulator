import { beforeAll, describe, it } from "vitest";
import {
  createFormulation,
  duplicateFormulation,
  getFormulation,
  getVersion,
  listFormulations,
  listVersions,
  patchFormulation,
  restoreVersion,
  saveFormulation,
  validateFormulation,
} from "@/lib/api/formulations";
import {
  formulationListItemSchema,
  formulationSchema,
  formulationVersionSummarySchema,
  pagedSchema,
  validationResultSchema,
} from "@/lib/validation/schemas";
import type { Formulation } from "@/types";
import { testFormulation } from "./context";
import { contractAvailable, expectParses, signIn } from "./helpers";

describe.skipIf(!contractAvailable)("formulations contract", () => {
  let formulation: Formulation;

  beforeAll(async () => {
    await signIn();
    formulation = await testFormulation();
  });

  it("POST /api/formulations creates a draft", async () => {
    const draft = await createFormulation({
      name: `contract-draft-${Date.now()}`,
    });
    expectParses(formulationSchema, draft, "POST /api/formulations");
  });

  it("GET /api/formulations returns a page", async () => {
    expectParses(
      pagedSchema(formulationListItemSchema),
      await listFormulations({ page_size: 5 }),
      "GET /api/formulations",
    );
  });

  it("GET /api/formulations/{id}", async () => {
    expectParses(
      formulationSchema,
      await getFormulation(formulation.id),
      "GET /api/formulations/{id}",
    );
  });

  it("PUT /api/formulations/{id} saves a version", async () => {
    const saved = await saveFormulation(formulation.id, {
      base_version: formulation.version,
      name: formulation.name,
      lines: formulation.lines,
    });
    expectParses(formulationSchema, saved, "PUT /api/formulations/{id}");
    formulation = saved;
  });

  it("POST /api/formulations/{id}/validate", async () => {
    expectParses(
      validationResultSchema,
      await validateFormulation(formulation.id, { lines: formulation.lines }),
      "POST /api/formulations/{id}/validate",
    );
  });

  it("PATCH /api/formulations/{id}", async () => {
    const patched = await patchFormulation(formulation.id, {
      description: "contract test",
    });
    expectParses(formulationSchema, patched, "PATCH /api/formulations/{id}");
    formulation = patched;
  });

  it("POST /api/formulations/{id}/duplicate", async () => {
    expectParses(
      formulationSchema,
      await duplicateFormulation(formulation.id),
      "POST /api/formulations/{id}/duplicate",
    );
  });

  it("GET /api/formulations/{id}/versions", async () => {
    expectParses(
      pagedSchema(formulationVersionSummarySchema),
      await listVersions(formulation.id, { page_size: 20 }),
      "GET /api/formulations/{id}/versions",
    );
  });

  it("GET /api/formulations/{id}/versions/{version}", async () => {
    expectParses(
      formulationSchema,
      await getVersion(formulation.id, 1),
      "GET /api/formulations/{id}/versions/{version}",
    );
  });

  it("POST /api/formulations/{id}/versions/{version}/restore", async () => {
    expectParses(
      formulationSchema,
      await restoreVersion(formulation.id, 1, {
        base_version: formulation.version,
      }),
      "POST /api/formulations/{id}/versions/{version}/restore",
    );
  });
});
