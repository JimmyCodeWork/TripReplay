/**
 * Comparing TripReplay's version with the published releases, for the manual update check of the
 * Android and Windows applications (docs/ui-design.md §2.2). Versions follow Semantic Versioning.
 */

/** A published release, as the shell reads it from the release list. */
export interface Release {
  /** The release's tag, such as `v1.0.0` or `v1.1.0-beta.1`. */
  readonly tag: string;
  /** The release's page, where its files are downloaded. */
  readonly url: string;
  readonly prerelease: boolean;
  readonly draft: boolean;
}

interface Version {
  readonly core: readonly [number, number, number];
  readonly pre: readonly string[];
}

/** Reads `1.2.3`, `v1.2.3` or `1.2.3-beta.1`, ignoring build metadata; undefined for anything else. */
function parse(text: string): Version | undefined {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(text.trim());
  if (!match) return undefined;
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    pre: match[4] ? match[4].split(".") : [],
  };
}

function comparePre(a: readonly string[], b: readonly string[]): number {
  // A version without a pre-release part comes after the same version with one.
  if (a.length === 0 || b.length === 0) return b.length - a.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (x === undefined || y === undefined) return x === undefined ? -1 : 1;
    if (x === y) continue;
    const numeric = /^\d+$/;
    if (numeric.test(x) && numeric.test(y)) return Number(x) - Number(y);
    if (numeric.test(x) !== numeric.test(y)) return numeric.test(x) ? -1 : 1;
    return x < y ? -1 : 1;
  }
  return 0;
}

/**
 * Orders two versions by Semantic Versioning precedence: negative when `a` comes first, positive
 * when `b` does, 0 when they are equal. Undefined when either is not a version.
 */
export function compareVersions(a: string, b: string): number | undefined {
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return undefined;
  for (let i = 0; i < 3; i++) {
    const difference = (x.core[i] as number) - (y.core[i] as number);
    if (difference !== 0) return difference;
  }
  return comparePre(x.pre, y.pre);
}

/** Whether `version` is a pre-release, such as `1.0.0-beta.1`. */
export function isPrerelease(version: string): boolean {
  return (parse(version)?.pre.length ?? 0) > 0;
}

/**
 * The newest release that is newer than `current`, or undefined when there is none. Drafts and
 * tags that are not versions are skipped; pre-releases are offered only to a pre-release, so that
 * those who test a beta hear of the next one, and others only of finished versions.
 */
export function newerRelease(releases: readonly Release[], current: string): Release | undefined {
  const offerPrereleases = isPrerelease(current);
  let newest: Release | undefined;
  for (const release of releases) {
    if (release.draft || (release.prerelease && !offerPrereleases)) continue;
    const order = compareVersions(release.tag, current);
    if (order === undefined || order <= 0) continue;
    if (!newest || (compareVersions(release.tag, newest.tag) ?? 0) > 0) newest = release;
  }
  return newest;
}
