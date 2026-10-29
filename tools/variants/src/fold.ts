/** Parses an OpenCC dictionary: one `key<TAB>value value…` entry per line, `#` starts a comment. */
export function parseDictionary(text: string): [string, string[]][] {
  const entries: [string, string[]][] = [];
  for (const line of text.split("\n")) {
    if (line.startsWith("#") || line.trim() === "") continue;
    const [key, values] = line.split("\t");
    if (key && values) entries.push([key, values.trim().split(" ")]);
  }
  return entries;
}

const single = (text: string) => Array.from(text).length === 1;

/**
 * Builds a table that folds variant characters to one form per group. Each dictionary maps a key to
 * its preferred candidate (the first value that differs from the key); dictionaries are applied in
 * order, and a group keeps the form its first mapping pointed to. Multi-character entries are
 * skipped, since folding works character by character.
 */
export function foldTable(dictionaries: readonly (readonly [string, string[]][])[]): Map<string, string> {
  const parent = new Map<string, string>();
  const root = (c: string): string => {
    let r = c;
    for (let next = parent.get(r); next !== undefined; next = parent.get(r)) r = next;
    return r;
  };
  for (const dictionary of dictionaries) {
    for (const [key, values] of dictionary) {
      const value = values.find((v) => v !== key);
      if (!value || !single(key) || !single(value)) continue;
      const from = root(key);
      const to = root(value);
      if (from !== to) parent.set(from, to);
    }
  }
  const table = new Map<string, string>();
  for (const c of [...parent.keys()].sort()) table.set(c, root(c));
  return table;
}

/**
 * Simplified characters mapped to the Traditional form used in Taiwan: the first Traditional
 * candidate of the Simplified-to-Traditional dictionary, followed through the Taiwan variants.
 */
export function simplifiedTable(
  simplifiedToTraditional: readonly [string, string[]][],
  taiwanVariants: readonly [string, string[]][],
): Map<string, string> {
  const folded = foldTable([simplifiedToTraditional, taiwanVariants]);
  const table = new Map<string, string>();
  for (const [key] of simplifiedToTraditional) {
    const target = folded.get(key);
    if (target && Array.from(key).length === 1) table.set(key, target);
  }
  return table;
}

/** The generated TypeScript module: per export, pairs of characters, the second replacing the first. */
export function renderModule(tables: Readonly<Record<string, ReadonlyMap<string, string>>>, header: string): string {
  const exports = Object.entries(tables).map(([name, table]) => {
    const pairs = [...table].map(([from, to]) => from + to);
    const lines: string[] = [];
    for (let i = 0; i < pairs.length; i += 40) lines.push(`  "${pairs.slice(i, i + 40).join("")}",`);
    return `export const ${name}: readonly string[] = [\n${lines.join("\n")}\n];\n`;
  });
  return `${header}\n${exports.join("\n")}`;
}
