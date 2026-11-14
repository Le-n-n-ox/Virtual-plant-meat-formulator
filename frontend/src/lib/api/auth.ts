import { requestValidated } from "./client";
import {
  authUserSchema,
  loginRequestSchema,
  loginResponseSchema,
  logoutResponseSchema,
} from "@/lib/validation/schemas";

export function login(email: string, password: string) {
  return requestValidated("/api/auth/login", loginResponseSchema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(loginRequestSchema.parse({ email, password })),
  });
}

export function logout() {
  return requestValidated("/api/auth/logout", logoutResponseSchema, {
    method: "POST",
  });
}

export function getMe() {
  return requestValidated("/api/auth/me", authUserSchema);
}
