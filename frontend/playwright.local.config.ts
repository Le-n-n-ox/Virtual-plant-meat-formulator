// Throwaway: runs the e2e suite against an already-running dev server on 3100.
// `next dev` refuses a second server per directory, so the committed config's
// webServer block cannot start one. Delete after use.
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  // Match the committed config: a real nutrition job needs more than 30s.
  timeout: 120_000,
  use: {
    baseURL: "http://localhost:3100",
    // Headless Chromium has no GPU; without software GL the scene falls back
    // to 2D and every 3D assertion skips.
    launchOptions: {
      args: [
        "--use-gl=angle",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--ignore-gpu-blocklist",
      ],
    },
    ...devices["Desktop Chrome"],
  },
  reporter: "line",
});
