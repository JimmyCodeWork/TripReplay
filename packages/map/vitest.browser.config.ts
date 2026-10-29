import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

/** Runs the MapLibre adapter in Chromium; SwiftShader provides WebGL without a GPU. */
export default defineConfig({
  // MapLibre loads its worker relative to its own module, which pre-bundling would break.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  test: {
    include: ["test/browser/**/*.test.ts"],
    browser: {
      enabled: true,
      headless: true,
      // CHROMIUM_PATH points to an existing Chromium where Playwright cannot download its own.
      provider: playwright({
        launchOptions: {
          args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
          ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
        },
      }),
      instances: [{ browser: "chromium" }],
    },
  },
});
