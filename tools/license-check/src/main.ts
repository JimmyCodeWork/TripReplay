// Verifies installed dependencies against the Dependency License Policy.
// Run from the repository root after `pnpm install --frozen-lockfile`.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { check, type InstalledPackage, type Inventory, type Policy } from "./check.ts";

interface PnpmLicenseRecord {
  readonly name: string;
  readonly versions: readonly string[];
  readonly paths: readonly string[];
  readonly license: string;
}

const root = process.cwd();

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(join(root, path), "utf8")) as T;
}

function productionPackages(): InstalledPackage[] {
  const output = execFileSync("pnpm", ["licenses", "list", "--json", "--prod", "--recursive"], {
    cwd: root,
    encoding: "utf8",
  });
  if (output.trim() === "" || output.includes("No licenses in packages found")) return [];
  const groups = JSON.parse(output) as Record<string, PnpmLicenseRecord[]>;
  const packages: InstalledPackage[] = [];
  for (const records of Object.values(groups)) {
    for (const record of records) {
      // Workspace packages are covered by the project's own MIT License.
      if (record.paths.every((path) => !path.includes("node_modules"))) continue;
      for (const version of record.versions) {
        packages.push({ name: record.name, version, license: record.license });
      }
    }
  }
  return packages;
}

function directDevelopmentDependencies(): string[] {
  const output = execFileSync("pnpm", ["list", "--recursive", "--depth", "-1", "--json"], {
    cwd: root,
    encoding: "utf8",
  });
  const projects = JSON.parse(output) as { path: string }[];
  return projects.flatMap((project) => {
    const manifest = JSON.parse(readFileSync(join(project.path, "package.json"), "utf8")) as {
      devDependencies?: Record<string, string>;
    };
    // Workspace packages are the project's own code under its MIT License.
    return Object.entries(manifest.devDependencies ?? {})
      .filter(([, spec]) => !spec.startsWith("workspace:"))
      .map(([name]) => name);
  });
}

const errors = check({
  policy: readJson<Policy>("licenses/policy.json"),
  inventory: readJson<Inventory>("licenses/inventory.json"),
  production: productionPackages(),
  directDevelopment: directDevelopmentDependencies(),
});

if (errors.length > 0) {
  console.error(`License check failed with ${errors.length} problem(s):\n`);
  for (const error of errors) console.error(`  - ${error}`);
  console.error("\nSee docs/license-policy.md and CONTRIBUTING.md#adding-a-dependency.");
  process.exit(1);
}
console.log("License check passed.");
