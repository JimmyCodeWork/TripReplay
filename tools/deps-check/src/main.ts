// Verifies that product packages respect the dependency rules of docs/architecture.md.
// Run from the repository root.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { type Boundaries, check, importsOf, type PackageInfo, SCOPE } from "./check.ts";

const root = process.cwd();
const boundaries = JSON.parse(readFileSync(join(root, "tools/deps-check/boundaries.json"), "utf8")) as Boundaries;

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist") continue;
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) files.push(...sourceFiles(path));
    else if (/\.(ts|tsx)$/.test(entry)) files.push(path);
  }
  return files;
}

const packages: PackageInfo[] = [];
for (const group of ["packages", "apps"]) {
  let entries: string[] = [];
  try {
    entries = readdirSync(join(root, group));
  } catch {
    continue;
  }
  for (const entry of entries) {
    const dir = join(root, group, entry);
    let manifest: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
    try {
      manifest = JSON.parse(readFileSync(join(dir, "package.json"), "utf8"));
    } catch {
      continue;
    }
    const declared = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies })
      .filter((name) => name.startsWith(SCOPE))
      .map((name) => name.slice(SCOPE.length));
    const imports = sourceFiles(dir).flatMap((file) =>
      importsOf(readFileSync(file, "utf8")).map((specifier) => ({
        file: relative(dir, file).split(sep).join("/"),
        specifier,
      })),
    );
    packages.push({ name: entry, declared, imports });
  }
}

const errors = check(boundaries, packages);
if (errors.length > 0) {
  console.error(`Dependency check failed with ${errors.length} problem(s):\n`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}
console.log(`Dependency check passed (${packages.length} packages).`);
