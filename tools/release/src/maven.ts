// The Maven libraries in the Android application, from Gradle's dependency report, checked against
// their review in licenses/inventory.json (docs/license-policy.md §6). Pure functions; android.ts
// reads the inputs.

/** A library on the runtime classpath, as Gradle resolved it. */
export interface MavenLibrary {
  readonly group: string;
  readonly artifact: string;
  readonly version: string;
}

/** The review of a Maven library, keyed by "group:artifact@version". */
export interface MavenEntry {
  readonly declared: string;
  readonly category: "code" | "asset";
  readonly homepage?: string;
  /** The library's Apache-2.0 `NOTICE` text, kept in the repository, which the notices reproduce. */
  readonly noticeFile?: string;
  readonly note?: string;
}

export const mavenKey = (library: MavenLibrary) => `${library.group}:${library.artifact}@${library.version}`;

export const mavenPurl = (library: MavenLibrary) => `pkg:maven/${library.group}/${library.artifact}@${library.version}`;

/**
 * The libraries of `gradle :app:dependencies --configuration releaseRuntimeClasspath`, each once,
 * at the version Gradle chose. Project modules, constraints `(c)` and unresolved entries `(n)` are
 * left out.
 */
export function parseGradleDependencies(report: string): MavenLibrary[] {
  const found = new Map<string, MavenLibrary>();
  for (const line of report.split("\n")) {
    const match = /^[|\s]*[+\\]--- (.+)$/.exec(line.trimEnd());
    if (!match) continue;
    const entry = (match[1] as string).replace(/ \(\*\)$/, "");
    if (entry.startsWith("project ") || / \([cn]\)$/.test(entry)) continue;
    const [coordinates, chosen] = entry.split(" -> ") as [string, string | undefined];
    const [group, artifact, requested] = coordinates.split(":");
    const version = (chosen ?? requested)?.replace(/^\{strictly (.+)\}$/, "$1").replace(/ .*$/, "");
    if (!group || !artifact || !version) continue;
    const library = { group, artifact, version };
    found.set(mavenKey(library), library);
  }
  return [...found.values()].sort((a, b) => mavenKey(a).localeCompare(mavenKey(b), "en"));
}

/**
 * Problems that stop a release: libraries that are not reviewed, licenses that the policy does
 * not allow for their category, and reviews of libraries that are no longer in the application.
 */
export function checkMaven(
  libraries: readonly MavenLibrary[],
  reviewed: Readonly<Record<string, MavenEntry>>,
  allowed: { readonly code: readonly string[]; readonly asset: readonly string[] },
): string[] {
  const errors: string[] = [];
  const keys = new Set(libraries.map(mavenKey));
  for (const library of libraries) {
    const key = mavenKey(library);
    const entry = reviewed[key];
    if (!entry) {
      errors.push(
        `${key} is in the Android application but not reviewed in the "maven" section of licenses/inventory.json`,
      );
      continue;
    }
    const permitted = entry.category === "code" ? allowed.code : [...allowed.code, ...allowed.asset];
    if (!permitted.includes(entry.declared)) {
      errors.push(`${key} (${entry.declared}) is not permitted for category "${entry.category}"`);
    }
  }
  for (const key of Object.keys(reviewed)) {
    if (!keys.has(key)) errors.push(`${key} is reviewed but no longer in the Android application; remove the entry`);
  }
  return errors;
}
