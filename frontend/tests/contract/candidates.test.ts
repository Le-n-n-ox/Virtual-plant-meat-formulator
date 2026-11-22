import { beforeAll, describe, it } from "vitest";
import {
  compareCandidates,
  getCandidate,
  listCandidates,
  promoteCandidate,
} from "@/lib/api/candidates";
import {
  candidateSchema,
  compareResponseSchema,
  formulationSchema,
  pagedSchema,
} from "@/lib/validation/schemas";
import type { Formulation } from "@/types";
import { testFormulation } from "./context";
import { contractAvailable, expectParses, signIn } from "./helpers";

describe.skipIf(!contractAvailable)("candidates contract", () => {
  let formulation: Formulation;

  beforeAll(async () => {
    await signIn();
    formulation = await testFormulation();
  });

  it("GET /api/formulations/{id}/candidates", async () => {
    const page = await listCandidates(formulation.id, { page_size: 20 });
    expectParses(
      pagedSchema(candidateSchema),
      page,
      "GET /api/formulations/{id}/candidates",
    );

    const [a, b] = page.items;
    // No optimization has run for this fresh formulation, so there is nothing
    // to fetch by id, compare or promote.
    if (!a) return;

    expectParses(
      candidateSchema,
      await getCandidate(a.id),
      "GET /api/candidates/{id}",
    );
    if (b) {
      expectParses(
        compareResponseSchema,
        await compareCandidates(a.id, b.id),
        "GET /api/compare",
      );
    }
    expectParses(
      formulationSchema,
      await promoteCandidate(a.id),
      "POST /api/candidates/{id}/promote",
    );
  });
});
