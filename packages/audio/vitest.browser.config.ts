import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

/**
 * Runs the adapter tests against real Web Audio in Chromium. Playback normally needs a click on
 * the page, which the tests stand in for with the autoplay flag.
 */
export default defineConfig({
  test: {
    include: ["test/browser/**/*.test.ts"],
    browser: {
      enabled: true,
      headless: true,
      // CHROMIUM_PATH points to an existing Chromium where Playwright cannot download its own.
      provider: playwright({
        launchOptions: {
          args: ["--autoplay-policy=no-user-gesture-required"],
          ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
        },
      }),
      instances: [{ browser: "chromium" }],
    },
  },
});
