import { describe, it } from "vitest";
import { getHealth } from "@/lib/api/client";
import { login, logout, me } from "@/lib/api/auth";
import {
  currentUserSchema,
  healthResponseSchema,
  loginResponseSchema,
} from "@/lib/validation/schemas";
import {
  contractAvailable,
  EMAIL,
  expectParses,
  PASSWORD,
  signIn,
} from "./helpers";

describe.skipIf(!contractAvailable)("auth contract", () => {
  it("POST /api/auth/login returns a token", async () => {
    const result = await login(EMAIL, PASSWORD);
    expectParses(loginResponseSchema, result, "POST /api/auth/login");
  });

  it("GET /api/auth/me returns the signed-in user", async () => {
    await signIn();
    expectParses(currentUserSchema, await me(), "GET /api/auth/me");
  });

  it("GET /api/health reports ok", async () => {
    expectParses(healthResponseSchema, await getHealth(), "GET /api/health");
  });

  it("POST /api/auth/logout answers 204 with no body", async () => {
    await signIn();
    await logout();
  });
});
