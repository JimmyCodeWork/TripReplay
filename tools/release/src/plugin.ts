// Vite plugin that writes THIRD-PARTY-NOTICES.txt and sbom.cdx.json for the code a build bundled,
// and fails the build when a bundled package has not been reviewed (docs/license-policy.md §6).

import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Plugin } from "vite";
import {
  type Component,
  lockfileIntegrity,
  packageOfModule,
  renderNotices,
  renderSbom,
  unreviewed,
} from "./notices.ts";

export const NOTICES_FILE = "THIRD-PARTY-NOTICES.txt";
export const SBOM_FILE = "sbom.cdx.json";

interface Manifest {
  readonly name: string;
  readonly version: string;
  readonly license?: string;
  readonly homepage?: string;
  readonly repository?: string | { readonly url?: string };
}

interface EmbeddedContent {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly homepage?: string;
  readonly licenseFile: string;
  readonly usedIn?: string;
}

const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\.[a-z]+)?$/i;

function licenseText(root: string): string | undefined {
  const files = readdirSync(root)
    .filter((file) => LICENSE_FILE.test(file))
    .sort();
  if (files.length === 0) return undefined;
  return files.map((file) => readFileSync(join(root, file), "utf8").trim()).join("\n\n");
}

function homepage(manifest: Manifest): string | undefined {
  const repo = typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url;
  return manifest.homepage ?? repo?.replace(/^git\+/, "").replace(/\.git$/, "");
}

export interface ReleasePluginOptions {
  /** The repository root, which holds the lockfile and licenses/. */
  readonly root: string;
  readonly product: string;
  readonly version: string;
  /**
   * Also writes the components, with their license texts, to this JSON file, from which the Android
   * build adds its own libraries to the notices and the SBOM (`src/android.ts`).
   */
  readonly componentsFile?: string;
}

/** Collects the bundled packages of a production build and emits the notices and the SBOM. */
export function releaseNotices({ root, product, version, componentsFile }: ReleasePluginOptions): Plugin {
  return {
    name: "tripreplay-release-notices",
    apply: "build",
    generateBundle(_options, bundle) {
      const roots = new Map<string, string>();
      for (const output of Object.values(bundle)) {
        if (output.type !== "chunk") continue;
        for (const id of output.moduleIds) {
          const found = packageOfModule(id);
          if (found) {
            const real = realpathSync(found.root);
            if (!roots.has(real)) roots.set(real, found.name);
          }
        }
      }
      // Packages such as maplibre-gl ship a prebuilt bundle that contains their own dependencies,
      // so the production dependencies of every bundled package are part of the release too.
      const pending = [...roots.keys()];
      for (let packageRoot = pending.pop(); packageRoot !== undefined; packageRoot = pending.pop()) {
        const manifestPath = join(packageRoot, "package.json");
        if (!existsSync(manifestPath)) continue;
        const { dependencies = {} } = JSON.parse(readFileSync(manifestPath, "utf8")) as {
          dependencies?: Record<string, string>;
        };
        // pnpm links a package's dependencies next to it: <store>/node_modules/<dependency>.
        const name = roots.get(packageRoot) as string;
        const siblings = name.includes("/") ? dirname(dirname(packageRoot)) : dirname(packageRoot);
        for (const dependency of Object.keys(dependencies)) {
          const dependencyRoot = realpathSync(join(siblings, dependency));
          if (!roots.has(dependencyRoot)) {
            roots.set(dependencyRoot, dependency);
            pending.push(dependencyRoot);
          }
        }
      }
      const integrity = lockfileIntegrity(readFileSync(join(root, "pnpm-lock.yaml"), "utf8"));
      const packages = new Map<string, Component>();
      for (const packageRoot of roots.keys()) {
        const manifestPath = join(packageRoot, "package.json");
        if (!existsSync(manifestPath)) continue;
        const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Manifest;
        const key = `${manifest.name}@${manifest.version}`;
        if (packages.has(key)) continue;
        packages.set(key, {
          name: manifest.name,
          version: manifest.version,
          license: manifest.license ?? "UNKNOWN",
          licenseText: licenseText(packageRoot),
          homepage: homepage(manifest),
          type: "library",
          integrity: integrity.get(key),
        });
      }
      const embedded = (
        JSON.parse(readFileSync(join(root, "licenses/embedded.json"), "utf8")) as { content: EmbeddedContent[] }
      ).content.map(
        (content): Component => ({
          name: content.name,
          version: content.version,
          license: content.license,
          licenseText: readFileSync(join(root, content.licenseFile), "utf8"),
          homepage: content.homepage,
          usedIn: content.usedIn,
          type: "data",
        }),
      );
      const components = [...packages.values(), ...embedded];
      const errors = unreviewed(components, JSON.parse(readFileSync(join(root, "licenses/inventory.json"), "utf8")));
      if (errors.length > 0) this.error(`License release gate:\n${errors.join("\n")}`);
      this.emitFile({ type: "asset", fileName: NOTICES_FILE, source: renderNotices(product, components) });
      const sbom = renderSbom({
        product,
        version,
        components,
        serial: randomUUID(),
        timestamp: new Date().toISOString(),
      });
      this.emitFile({ type: "asset", fileName: SBOM_FILE, source: `${JSON.stringify(sbom, null, 2)}\n` });
      if (componentsFile) {
        mkdirSync(dirname(componentsFile), { recursive: true });
        writeFileSync(componentsFile, `${JSON.stringify(components)}\n`);
      }
    },
  };
}
