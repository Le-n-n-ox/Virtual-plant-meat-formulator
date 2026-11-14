import type { AuthUser } from "@/types";

/** Mock signed-in user. Never a real account. */
export const MOCK_USER: AuthUser = {
  id: "mock-user-1",
  email: "scientist@example.test",
  name: "Mock Scientist",
  created_at: "2026-11-14T00:00:00Z",
};

export const MOCK_TOKEN = "mock-token-not-a-real-session";
