// Completes the notices and the SBOM of the Windows application (docs/releasing.md): the Web
// components of the page, the .NET packages that the publish ships, and the NSIS installer, and
// fails when one has not passed the license review (docs/license-policy.md §6).
//
//   node tools/release/src/windows.ts --assets <project.assets.json> --components <file> --out <dir> --nsis <version>
//
// Run from the repository root after `dotnet publish`, before the installer is built.

import { randomUUID } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { type Component, renderNotices, renderSbom } from "./notices.ts";
import { checkNuget, type NugetEntry, nugetKey, nugetPurl, type ProjectAssets, publishedPackages } from "./nuget.ts";
import { NOTICES_FILE, SBOM_FILE } from "./plugin.ts";

const { values } = parseArgs({
  options: {
    assets: { type: "string" },
    components: { type: "string" },
    out: { type: "string" },
    nsis: { type: "string" },
  },
});
if (!values.assets || !values.components || !values.out || !values.nsis) {
  console.error("Usage: windows.ts --assets <project.assets.json> --components <file> --out <dir> --nsis <version>");
  process.exit(2);
}

const root = process.cwd();
const readJson = <T>(path: string) => JSON.parse(readFileSync(path, "utf8")) as T;
const inventory = readJson<{
  nuget?: Record<string, NugetEntry>;
  installer?: Record<string, { declared: string; homepage?: string; noticeFile?: string }>;
}>(join(root, "licenses/inventory.json"));
const policy = readJson<{ allowed: { code: string[]; asset: string[] } }>(join(root, "licenses/policy.json"));
const { version } = readJson<{ version: string }>(join(root, "package.json"));

const assets = readJson<ProjectAssets>(values.assets);
const packages = publishedPackages(assets);
const reviewed = inventory.nuget ?? {};
const errors = checkNuget(packages, reviewed, policy.allowed);

// The installer's own code: NSIS, at the version that builds it.
const nsisVersion = values.nsis.replace(/^v/, "").replace(/-.*$/, "");
const nsis = inventory.installer?.[`NSIS@${nsisVersion}`];
if (!nsis)
  errors.push(
    `NSIS@${nsisVersion} builds the installer but is not reviewed in the "installer" section of licenses/inventory.json`,
  );
else if (!policy.allowed.code.includes(nsis.declared))
  errors.push(`NSIS@${nsisVersion} (${nsis.declared}) is not permitted`);

if (errors.length > 0) {
  console.error(`License release gate:\n${errors.join("\n")}`);
  console.error(`\nPackages the publish ships:\n${packages.map(nugetKey).join("\n")}`);
  process.exit(1);
}

const folder = Object.keys(assets.packageFolders ?? {})[0] ?? join(process.env.HOME ?? "", ".nuget/packages");
const licenseText = (license: string) => readFileSync(join(root, "licenses/texts", `${license}.txt`), "utf8");
const nuget = packages.map((pkg): Component => {
  const entry = reviewed[nugetKey(pkg)] as NugetEntry;
  const files = (entry.packageFiles ?? []).map((file) =>
    readFileSync(join(folder, pkg.id.toLowerCase(), pkg.version, file), "utf8").trim(),
  );
  return {
    name: pkg.id,
    version: pkg.version,
    license: entry.declared,
    licenseText: files.length > 0 ? files.join("\n\n") : licenseText(entry.declared),
    homepage: entry.homepage,
    type: "library",
    purl: nugetPurl(pkg),
  };
});
const installer: Component[] = nsis
  ? [
      {
        name: "NSIS",
        version: nsisVersion,
        license: nsis.declared,
        licenseText: `${nsis.noticeFile ? `${readFileSync(join(root, nsis.noticeFile), "utf8").trim()}\n\n` : ""}${licenseText(nsis.declared)}`,
        homepage: nsis.homepage,
        type: "library",
      },
    ]
  : [];

const components = [...readJson<Component[]>(values.components), ...nuget, ...installer];
writeFileSync(join(values.out, NOTICES_FILE), renderNotices("TripReplay", components));
const sbom = renderSbom({
  product: "TripReplay",
  version,
  components,
  serial: randomUUID(),
  timestamp: new Date().toISOString(),
});
writeFileSync(join(values.out, SBOM_FILE), `${JSON.stringify(sbom, null, 2)}\n`);
console.log(`Notices and SBOM of the Windows application: ${components.length} components.`);
