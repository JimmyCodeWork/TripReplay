import { posix } from "node:path";

export const SCOPE = "@tripreplay/";

export interface Boundaries {
  readonly packages: Readonly<Record<string, readonly string[] | "*">>;
}

export interface ImportRef {
  /** File path relative to the package directory, using forward slashes. */
  readonly file: string;
  readonly specifier: string;
}

export interface PackageInfo {
  /** Name without the scope, for example `domain`. */
  readonly name: string;
  /** Internal packages declared in package.json, without the scope. */
  readonly declared: readonly string[];
  readonly imports: readonly ImportRef[];
}

function allowed(boundaries: Boundaries, from: string, to: string): boolean {
  const rule = boundaries.packages[from];
  return rule === "*" || (rule ?? []).includes(to);
}

function findCycle(graph: ReadonlyMap<string, readonly string[]>): string[] | undefined {
  const state = new Map<string, "visiting" | "done">();
  const stack: string[] = [];
  const visit = (node: string): string[] | undefined => {
    if (state.get(node) === "done") return undefined;
    if (state.get(node) === "visiting") return [...stack.slice(stack.indexOf(node)), node];
    state.set(node, "visiting");
    stack.push(node);
    for (const next of graph.get(node) ?? []) {
      const cycle = visit(next);
      if (cycle) return cycle;
    }
    stack.pop();
    state.set(node, "done");
    return undefined;
  };
  for (const node of graph.keys()) {
    const cycle = visit(node);
    if (cycle) return cycle;
  }
  return undefined;
}

export function check(boundaries: Boundaries, packages: readonly PackageInfo[]): string[] {
  const errors: string[] = [];
  for (const pkg of packages) {
    if (!(pkg.name in boundaries.packages)) {
      errors.push(
        `${pkg.name}: package is not listed in tools/deps-check/boundaries.json. Add it to the architecture first.`,
      );
      continue;
    }
    for (const dep of pkg.declared) {
      if (!allowed(boundaries, pkg.name, dep))
        errors.push(`${pkg.name}: may not depend on ${dep} (docs/architecture.md §3).`);
    }
    for (const { file, specifier } of pkg.imports) {
      const where = `${pkg.name}/${file}`;
      if (specifier.startsWith(SCOPE)) {
        const [target, ...rest] = specifier.slice(SCOPE.length).split("/");
        if (target === pkg.name)
          errors.push(`${where}: imports its own package "${specifier}"; use a relative import.`);
        else if (rest.length > 0)
          errors.push(`${where}: deep import "${specifier}"; import from "${SCOPE}${target}" only.`);
        else if (target && !pkg.declared.includes(target))
          errors.push(`${where}: imports ${target} without declaring it in package.json.`);
      } else if (specifier.startsWith(".")) {
        const resolved = posix.normalize(posix.join(posix.dirname(file), specifier));
        if (resolved.startsWith("..")) errors.push(`${where}: relative import "${specifier}" leaves the package.`);
      }
    }
  }
  const graph = new Map(packages.map((p) => [p.name, p.declared]));
  const cycle = findCycle(graph);
  if (cycle) errors.push(`dependency cycle: ${cycle.join(" -> ")}`);
  return errors;
}

const IMPORT =
  /(?:^|[^\w.])(?:import|export)\s+(?:type\s+)?(?:[\w*{}\s,$]+\s+from\s+)?["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

/** Extracts module specifiers from TypeScript source. */
export function importsOf(source: string): string[] {
  const found: string[] = [];
  for (const match of source.matchAll(IMPORT)) {
    const specifier = match[1] ?? match[2];
    if (specifier) found.push(specifier);
  }
  return found;
}
