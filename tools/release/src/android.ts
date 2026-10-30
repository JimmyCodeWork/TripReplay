// Completes the notices and the SBOM of the Android application (docs/releasing.md): the Web
// components of the page, the Capacitor runtime and the Maven libraries that Gradle resolved, and
// fails when a library has not passed the license review (docs/license-policy.md §6).
//
//   node tools/release/src/android.ts --gradle <dependency report> --components <file> --assets <dir>
//
// Run from the repository root after `cap sync`, before Gradle packages the assets.

import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { checkMaven, type MavenEntry, mavenKey, mavenPurl, parseGradleDependencies } from "./maven.ts";
import { type Component, renderNotices, renderSbom, unreviewed } from "./notices.ts";
import { NOTICES_FILE, SBOM_FILE } from "./plugin.ts";

const { values } = parseArgs({
  options: { gradle: { type: "string" }, components: { type: "string" }, assets: { type: "string" } },
});
if (!values.gradle || !values.components || !values.assets) {
  console.error("Usage: android.ts --gradle <dependency report> --components <file> --assets <dir>");
  process.exit(2);
}

const root = process.cwd();
const readJson = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
const inventory = readJson<{
  release: Record<string, { declared: string }>;
  maven?: Record<string, MavenEntry>;
}>(join(root, "licenses/inventory.json"));
const policy = readJson<{ allowed: { code: string[]; asset: string[] } }>(join(root, "licenses/policy.json"));
const { version } = readJson<{ version: string }>(join(root, "package.json"));

const libraries = parseGradleDependencies(readFileSync(values.gradle, "utf8"));
const reviewed = inventory.maven ?? {};
const mavenErrors = checkMaven(libraries, reviewed, policy.allowed);

// The Capacitor runtime: Java code and the page bridge from the npm package @capacitor/android.
const capacitorRoot = realpathSync(join(root, "apps/android/node_modules/@capacitor/android"));
const capacitorManifest = readJson<{ name: string; version: string; license: string; homepage?: string }>(
  join(capacitorRoot, "package.json"),
);
const capacitor: Component = {
  name: capacitorManifest.name,
  version: capacitorManifest.version,
  license: capacitorManifest.license,
  licenseText: readdirSync(capacitorRoot)
    .filter((file) => /^licen[cs]e(\.[a-z]+)?$/i.test(file))
    .map((file) => readFileSync(join(capacitorRoot, file), "utf8"))
    .join("\n\n"),
  homepage: capacitorManifest.homepage,
  type: "library",
};

const errors = [...mavenErrors, ...unreviewed([capacitor], inventory)];
if (errors.length > 0) {
  console.error(`License release gate:\n${errors.join("\n")}`);
  console.error(`\nLibraries Gradle resolved:\n${libraries.map(mavenKey).join("\n")}`);
  process.exit(1);
}

const licenseText = (license: string) => readFileSync(join(root, "licenses/texts", `${license}.txt`), "utf8");
const maven = libraries.map((library): Component => {
  const entry = reviewed[mavenKey(library)] as MavenEntry;
  return {
    name: `${library.group}:${library.artifact}`,
    version: library.version,
    license: entry.declared,
    licenseText: licenseText(entry.declared),
    homepage: entry.homepage,
    type: "library",
    purl: mavenPurl(library),
  };
});

const components = [...readJson<Component[]>(values.components), capacitor, ...maven];
writeFileSync(join(values.assets, NOTICES_FILE), renderNotices("TripReplay", components));
const sbom = renderSbom({
  product: "TripReplay",
  version,
  components,
  serial: randomUUID(),
  timestamp: new Date().toISOString(),
});
writeFileSync(join(values.assets, SBOM_FILE), `${JSON.stringify(sbom, null, 2)}\n`);
console.log(`Notices and SBOM of the Android application: ${components.length} components.`);
