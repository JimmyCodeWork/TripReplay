import { defineConfig } from "vite";

export default defineConfig({
  // MapLibre loads its worker relative to its own module, which pre-bundling would break.
  optimizeDeps: { exclude: ["maplibre-gl"] },
  build: { target: "es2022" },
});
