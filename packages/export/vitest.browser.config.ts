import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

/** Runs the encoding tests against real WebCodecs and Web Audio in Chromium. */
export default defineConfig({
  test: {
    include: ["test/browser/**/*.test.ts"],
    testTimeout: 60_000,
    browser: {
      enabled: true,
      headless: true,
      // CHROMIUM_PATH points to an existing Chromium where Playwright cannot download its own.
      provider: playwright({
        launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
      }),
      instances: [{ browser: "chromium" }],
    },
  },
});
