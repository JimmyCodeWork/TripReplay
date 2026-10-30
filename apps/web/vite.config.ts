import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { releaseNotices } from "@tripreplay/release";
import { defineConfig } from "vite";
import { contentSecurityPolicy, serviceWorker } from "./build-plugins.ts";

const root = fileURLToPath(new URL("../..", import.meta.url));
const { version } = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8")) as {
  version: string;
};

export default defineConfig({
  // Relative URLs, so that the site works under any path, such as a project page.
  base: "./",
  // MapLibre loads its worker relative to its own module, which pre-bundling would break.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  build: { target: "es2022" },
  plugins: [
    contentSecurityPolicy(),
    serviceWorker(fileURLToPath(new URL("public", import.meta.url))),
    releaseNotices({ root, product: "TripReplay", version }),
  ],
});
