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
export function foldTable(dictionaries: readonly [string, string[]][][]): Map<string, string> {
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

/** The generated TypeScript module: pairs of characters, the second being the folded form of the first. */
export function renderModule(table: ReadonlyMap<string, string>, header: string): string {
  const pairs = [...table].map(([from, to]) => from + to);
  const lines: string[] = [];
  for (let i = 0; i < pairs.length; i += 40) lines.push(`  "${pairs.slice(i, i + 40).join("")}",`);
  return `${header}\nexport const VARIANT_PAIRS: readonly string[] = [\n${lines.join("\n")}\n];\n`;
}
