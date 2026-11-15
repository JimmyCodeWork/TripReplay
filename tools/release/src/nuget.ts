// The .NET packages in the Windows application, from the restore's project.assets.json, checked
// against their review in licenses/inventory.json (docs/license-policy.md §6). Pure functions;
// windows.ts reads the inputs.

/** A NuGet package that the published application contains. */
export interface NugetPackage {
  readonly id: string;
  readonly version: string;
}

/** The review of a NuGet package, keyed by "Id@version". */
export interface NugetEntry {
  readonly declared: string;
  readonly category: "code" | "asset";
  readonly homepage?: string;
  /**
   * Files of the package, such as its LICENSE and third-party notices, that the notices reproduce
   * before the license text.
   */
  readonly packageFiles?: readonly string[];
  readonly note?: string;
}

export const nugetKey = (pkg: NugetPackage) => `${pkg.id}@${pkg.version}`;

export const nugetPurl = (pkg: NugetPackage) => `pkg:nuget/${pkg.id}@${pkg.version}`;

/** The parts of a project.assets.json that say what is published. */
export interface ProjectAssets {
  readonly libraries: Readonly<Record<string, { readonly type: string }>>;
  readonly packageFolders?: Readonly<Record<string, unknown>>;
  readonly project: {
    readonly frameworks: Readonly<
      Record<string, { readonly downloadDependencies?: readonly { readonly name: string; readonly version: string }[] }>
    >;
  };
}

/**
 * The packages a self-contained publish ships: the referenced packages, and the runtime packs of
 * .NET and the Windows Desktop runtime with the program's host. The ASP.NET Core runtime pack,
 * which the SDK downloads for every Windows project, is not published and is left out, as are
 * reference packs.
 */
export function publishedPackages(assets: ProjectAssets): NugetPackage[] {
  const found = new Map<string, NugetPackage>();
  for (const [key, library] of Object.entries(assets.libraries)) {
    if (library.type !== "package") continue;
    const [id, version] = key.split("/") as [string, string];
    found.set(nugetKey({ id, version }), { id, version });
  }
  for (const framework of Object.values(assets.project.frameworks)) {
    for (const download of framework.downloadDependencies ?? []) {
      if (!/\.(Runtime|Host)\.win-[a-z0-9]+$/.test(download.name) || download.name.includes(".AspNetCore.")) continue;
      const pkg = { id: download.name, version: download.version.replace(/^\[([^,\]]+).*$/, "$1") };
      found.set(nugetKey(pkg), pkg);
    }
  }
  return [...found.values()].sort((a, b) => nugetKey(a).localeCompare(nugetKey(b), "en"));
}

/**
 * Problems that stop a release: packages that are not reviewed, licenses that the policy does
 * not allow for their category, and reviews of packages that are no longer in the application.
 */
export function checkNuget(
  packages: readonly NugetPackage[],
  reviewed: Readonly<Record<string, NugetEntry>>,
  allowed: { readonly code: readonly string[]; readonly asset: readonly string[] },
): string[] {
  const errors: string[] = [];
  const keys = new Set(packages.map(nugetKey));
  for (const pkg of packages) {
    const key = nugetKey(pkg);
    const entry = reviewed[key];
    if (!entry) {
      errors.push(
        `${key} is in the Windows application but not reviewed in the "nuget" section of licenses/inventory.json`,
      );
      continue;
    }
    const permitted = entry.category === "code" ? allowed.code : [...allowed.code, ...allowed.asset];
    if (!permitted.includes(entry.declared)) {
      errors.push(`${key} (${entry.declared}) is not permitted for category "${entry.category}"`);
    }
  }
  for (const key of Object.keys(reviewed)) {
    if (!keys.has(key)) errors.push(`${key} is reviewed but no longer in the Windows application; remove the entry`);
  }
  return errors;
}
