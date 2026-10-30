import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { releaseNotices } from "@tripreplay/release";
import { defineConfig } from "vite";
import { contentSecurityPolicy, serviceWorker } from "./build-plugins.ts";

const root = fileURLToPath(new URL("../..", import.meta.url));
const { version } = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  version: string;
};

// `--mode native` builds the page of the Android application (apps/android) into dist-native.
// Its files are in the package, so there is no service worker.
export default defineConfig(({ mode }) => {
  const native = mode === "native";
  return {
    // Relative URLs, so that the site works under any path, such as a project page.
    base: "./",
    // MapLibre loads its worker relative to its own module, which pre-bundling would break.
    optimizeDeps: { exclude: ["maplibre-gl"] },
    build: { target: "es2022", outDir: native ? "dist-native" : "dist" },
    plugins: [
      contentSecurityPolicy(),
      ...(native ? [] : [serviceWorker(fileURLToPath(new URL("public", import.meta.url)))]),
      releaseNotices({
        root,
        product: "TripReplay",
        version,
        // The Android build adds its own libraries to the notices (tools/release/src/android.ts).
        ...(native ? { componentsFile: join(root, "apps/android/android/build/web-components.json") } : {}),
      }),
    ],
  };
});
