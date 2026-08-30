import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  timeout: 30_000,
  expect: { timeout: 8_000 },
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    // Phase 2's web app is on :3101. :3001 is PHASE-1, inherited when this config was
    // forked — and pointing Phase 2's suite at Phase 1 tests the wrong product, loudly for
    // the fulfilment specs and quietly for anything both phases happen to share.
    baseURL: process.env.XELOR_E2E_BASE_URL ?? "http://localhost:3101",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    ...devices["Desktop Chrome"],
  },
});
