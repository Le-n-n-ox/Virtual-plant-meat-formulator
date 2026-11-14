import type { CurrentUser } from "@/lib/api/auth";

/** Mock signed-in user. Never a real account. */
export const MOCK_USER: CurrentUser = {
  user_id: "mock-user-1",
  email: "scientist@example.test",
  display_name: "Mock Scientist",
  role: "scientist",
};

export const MOCK_TOKEN = "mock-token-not-a-real-session";
