// Notices and SBOM of a release, from the third-party code that the build actually bundled
// (docs/license-policy.md §6). Pure functions; the Vite plugin in plugin.ts gathers the inputs.

/** A third-party component in the release artifacts. */
export interface Component {
  readonly name: string;
  readonly version: string;
  /** License as declared by the package, or as recorded for embedded content. */
  readonly license: string;
  /** The component's license text, which the notices reproduce. */
  readonly licenseText: string | undefined;
  readonly homepage?: string | undefined;
  /** "library" for packages, "data" for embedded content such as character tables. */
  readonly type: "library" | "data";
  /** SRI integrity from the lockfile, for packages. */
  readonly integrity?: string | undefined;
  /** Where embedded content is used. */
  readonly usedIn?: string | undefined;
  /** Package URL, for packages that are not from npm, such as Maven libraries of the Android application. */
  readonly purl?: string | undefined;
}

/**
 * The package a bundled module belongs to, from its path: the segment after the last
 * `node_modules`, with its scope. Undefined for the project's own modules.
 */
export function packageOfModule(id: string): { readonly name: string; readonly root: string } | undefined {
  const path = id.replace(/\\/g, "/").replace(/^\0+/, "").split("?")[0] as string;
  const marker = "/node_modules/";
  const at = path.lastIndexOf(marker);
  if (at < 0) return undefined;
  const rest = path.slice(at + marker.length).split("/");
  const name = rest[0]?.startsWith("@") ? `${rest[0]}/${rest[1]}` : rest[0];
  if (!name || name.startsWith(".")) return undefined;
  return { name, root: `${path.slice(0, at + marker.length)}${name}` };
}

/** SRI integrity values of the lockfile's packages, by "name@version" (pnpm lockfile v9). */
export function lockfileIntegrity(lockfile: string): Map<string, string> {
  const result = new Map<string, string>();
  const pattern = /^ {2}'?((?:@[^@\s/]+\/)?[^@\s/]+)@([^:'\s(]+)'?:\n {4}resolution: \{integrity: ([^,}]+)/gm;
  for (const match of lockfile.matchAll(pattern)) result.set(`${match[1]}@${match[2]}`, match[3] as string);
  return result;
}

/** The release components that licenses/inventory.json does not cover, or covers with another license. */
export function unreviewed(
  components: readonly Component[],
  inventory: { readonly release: Readonly<Record<string, { readonly declared: string }>> },
): string[] {
  return components
    .filter((c) => c.type === "library")
    .flatMap((c) => {
      const entry = inventory.release[`${c.name}@${c.version}`];
      if (!entry)
        return [`${c.name}@${c.version} (${c.license}) is bundled but not reviewed in licenses/inventory.json`];
      if (entry.declared !== c.license) {
        return [`${c.name}@${c.version} declares "${c.license}", reviewed as "${entry.declared}"`];
      }
      return [];
    });
}

const byName = (a: Component, b: Component) => a.name.localeCompare(b.name, "en") || a.version.localeCompare(b.version);

/**
 * The THIRD-PARTY-NOTICES file: every component with its license and full license text. Texts
 * shared by several components are printed once.
 */
export function renderNotices(product: string, components: readonly Component[]): string {
  const sorted = [...components].sort(byName);
  const lines = [
    `${product} includes the following third-party software and data.`,
    "Each is distributed under the license shown with it.",
    "",
    "Map data is downloaded by the user from Overture Maps and is not part of this release; its",
    "attribution is shown in the application: © OpenStreetMap contributors, Overture Maps Foundation.",
    "",
  ];
  const seen = new Map<string, string>();
  for (const c of sorted) {
    lines.push("=".repeat(78), `${c.name} ${c.version}`, `License: ${c.license}`);
    if (c.homepage) lines.push(`Source: ${c.homepage}`);
    if (c.usedIn) lines.push(`Used in: ${c.usedIn}`);
    const text = c.licenseText?.trim();
    if (!text) lines.push("", "(The package includes no license file; see its declared license above.)");
    else if (seen.has(text)) lines.push("", `(Same license text as ${seen.get(text)}.)`);
    else {
      seen.set(text, `${c.name} ${c.version}`);
      lines.push("", text);
    }
    lines.push("");
  }
  return `${lines.join("\n")}\n`;
}

/** An SRI value (sha512-<base64>) as a CycloneDX hash. */
function hashOf(integrity: string | undefined): { alg: string; content: string } | undefined {
  const match = integrity && /^sha(256|384|512)-(.+)$/.exec(integrity);
  if (!match) return undefined;
  return { alg: `SHA-${match[1]}`, content: Buffer.from(match[2] as string, "base64").toString("hex") };
}

const purl = (c: Component) => {
  if (c.purl) return c.purl;
  const [scope, name] = c.name.startsWith("@") ? c.name.split("/") : [undefined, c.name];
  return `pkg:npm/${scope ? `${encodeURIComponent(scope as string)}/` : ""}${name}@${c.version}`;
};

const SPDX_ID = /^[A-Za-z0-9.+-]+$/;

/** The SBOM as CycloneDX 1.5 JSON. `serial` is a UUID; `timestamp` the build time. */
export function renderSbom(input: {
  readonly product: string;
  readonly version: string;
  readonly components: readonly Component[];
  readonly serial: string;
  readonly timestamp: string;
}): object {
  return {
    bomFormat: "CycloneDX",
    specVersion: "1.5",
    serialNumber: `urn:uuid:${input.serial}`,
    version: 1,
    metadata: {
      timestamp: input.timestamp,
      component: {
        type: "application",
        name: input.product,
        version: input.version,
        licenses: [{ license: { id: "MIT" } }],
      },
    },
    components: [...input.components].sort(byName).map((c) => {
      const hash = hashOf(c.integrity);
      return {
        type: c.type,
        name: c.name,
        version: c.version,
        ...(c.type === "library" ? { purl: purl(c), "bom-ref": purl(c) } : { "bom-ref": `${c.name}@${c.version}` }),
        licenses: [SPDX_ID.test(c.license) ? { license: { id: c.license } } : { expression: c.license }],
        ...(hash ? { hashes: [hash] } : {}),
        ...(c.homepage ? { externalReferences: [{ type: "website", url: c.homepage }] } : {}),
      };
    }),
  };
}
