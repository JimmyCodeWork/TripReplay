import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

/** Runs the adapter tests against the real decoders and OPFS in Chromium. */
export default defineConfig({
  test: {
    include: ["test/browser/**/*.test.ts"],
    browser: {
      enabled: true,
      headless: true,
      // CHROMIUM_PATH points to an existing Chromium where Playwright cannot download its own.
      provider: playwright(
        process.env.CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.CHROMIUM_PATH } } : {},
      ),
      instances: [{ browser: "chromium" }],
    },
  },
});
