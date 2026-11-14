import { jsonInit, requestJson } from "./client";
import { tokenStore } from "./token";

export interface LoginResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface CurrentUser {
  user_id: string;
  email: string;
  display_name: string;
  role: "viewer" | "scientist" | "curator" | "admin" | string;
}

export async function login(
  email: string,
  password: string,
): Promise<LoginResponse> {
  const result = await requestJson<LoginResponse>(
    "/api/auth/login",
    jsonInit("POST", { email, password }),
  );
  tokenStore.set(result.access_token);
  return result;
}

export async function logout(): Promise<void> {
  try {
    await requestJson<void>("/api/auth/logout", { method: "POST" });
  } finally {
    tokenStore.clear();
  }
}

export function me(): Promise<CurrentUser> {
  return requestJson<CurrentUser>("/api/auth/me");
}

export const authApi = { login, logout, me };
export type AuthApi = typeof authApi;
