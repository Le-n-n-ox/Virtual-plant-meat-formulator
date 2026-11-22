import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const apiUrl = process.env.E2E_API_URL ?? "http://localhost:8000";

/**
 * Contract tests call a real backend. They are excluded from the default
 * `npm test` run and are executed with `npm run test:contract`.
 *
 * Set E2E_API_URL, E2E_EMAIL and E2E_PASSWORD to point at a running stack; when
 * no backend answers, every suite skips.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["tests/contract/**/*.test.ts"],
    testTimeout: 300_000,
    // These tests share one database and one job queue, so run them one file at
    // a time instead of competing for the backend.
    fileParallelism: false,
    // `lib/api/client.ts` reads NEXT_PUBLIC_API_BASE_URL once, at import time,
    // so the URL has to be in place before any module under test loads.
    env: {
      NEXT_PUBLIC_API_BASE_URL: apiUrl,
      E2E_API_URL: apiUrl,
      E2E_EMAIL: process.env.E2E_EMAIL ?? "",
      E2E_PASSWORD: process.env.E2E_PASSWORD ?? "",
      E2E_ADMIN_EMAIL: process.env.E2E_ADMIN_EMAIL ?? "",
      E2E_ADMIN_PASSWORD: process.env.E2E_ADMIN_PASSWORD ?? "",
    },
  },
});
