import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    // The contract suite needs a live backend; run it with `npm run test:contract`.
    exclude: ["tests/contract/**"],
  },
});
