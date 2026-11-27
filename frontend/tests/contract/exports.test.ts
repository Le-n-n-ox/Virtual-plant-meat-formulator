import { beforeAll, describe, expect, it } from "vitest";
import { downloadExport } from "@/lib/api/exports";
import type { Formulation } from "@/types";
import { testFormulation } from "./context";
import { contractAvailable, signIn } from "./helpers";

/**
 * Exports are blobs, not JSON, so there is no schema to parse: the contract
 * here is that the endpoint answers with a non-empty document.
 */
describe.skipIf(!contractAvailable)("exports contract", () => {
  let formulation: Formulation;

  beforeAll(async () => {
    await signIn();
    formulation = await testFormulation();
  });

  it("GET /api/formulations/{id}/export?format=csv", async () => {
    const { blob } = await downloadExport(formulation.id, "csv");
    expect(blob.size).toBeGreaterThan(0);
  });

  it("GET /api/formulations/{id}/export?format=pdf", async () => {
    const { blob } = await downloadExport(formulation.id, "pdf");
    expect(blob.size).toBeGreaterThan(0);
  });
});
