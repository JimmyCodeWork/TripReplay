import { parse, SpdxParseError, satisfies } from "./spdx.ts";

export type Category = "code" | "asset";

export interface Policy {
  readonly allowed: Readonly<Record<Category, readonly string[]>>;
}

export interface ReleaseEntry {
  /** License string exactly as declared by the package. */
  readonly declared: string;
  /** SPDX expression determined by review, when the declared value is not valid SPDX. */
  readonly resolved?: string;
  readonly category: Category;
  readonly note?: string;
}

export interface Inventory {
  /** Packages shipped in release artifacts, keyed by "name@version". */
  readonly release: Readonly<Record<string, ReleaseEntry>>;
  /** Approved direct development dependencies, by package name. */
  readonly development: readonly string[];
}

export interface InstalledPackage {
  readonly name: string;
  readonly version: string;
  readonly license: string;
}

export interface CheckInput {
  readonly policy: Policy;
  readonly inventory: Inventory;
  /** All production packages, including transitive dependencies. */
  readonly production: readonly InstalledPackage[];
  /** Direct development dependency names declared across the workspace. */
  readonly directDevelopment: readonly string[];
}

export function check(input: CheckInput): string[] {
  const errors: string[] = [];
  const allowed: Record<Category, Set<string>> = {
    code: new Set(input.policy.allowed.code),
    asset: new Set([...input.policy.allowed.code, ...input.policy.allowed.asset]),
  };
  const installed = new Set<string>();

  for (const pkg of input.production) {
    const key = `${pkg.name}@${pkg.version}`;
    installed.add(key);
    const entry = input.inventory.release[key];
    if (!entry) {
      errors.push(`${key} (${pkg.license}): not reviewed. Add it to licenses/inventory.json after review.`);
      continue;
    }
    if (entry.declared !== pkg.license) {
      errors.push(`${key}: declared license changed from "${entry.declared}" to "${pkg.license}". Review again.`);
      continue;
    }
    const expression = entry.resolved ?? entry.declared;
    try {
      if (!satisfies(parse(expression), allowed[entry.category])) {
        errors.push(`${key} (${expression}): not permitted for category "${entry.category}".`);
      }
    } catch (error) {
      if (!(error instanceof SpdxParseError)) throw error;
      errors.push(`${key}: "${expression}" is not a valid SPDX expression. Set "resolved" after review.`);
    }
  }

  for (const key of Object.keys(input.inventory.release)) {
    if (!installed.has(key)) {
      errors.push(`${key}: listed in licenses/inventory.json but not installed. Remove the entry.`);
    }
  }

  const approvedDevelopment = new Set(input.inventory.development);
  for (const name of new Set(input.directDevelopment)) {
    if (!approvedDevelopment.has(name)) {
      errors.push(`${name}: development dependency not approved. Add it to "development" in licenses/inventory.json.`);
    }
  }
  for (const name of approvedDevelopment) {
    if (!input.directDevelopment.includes(name)) {
      errors.push(`${name}: approved development dependency is no longer used. Remove the entry.`);
    }
  }

  return errors.sort();
}
