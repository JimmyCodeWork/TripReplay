import { getCatalog, type MessageKey } from "./catalog.ts";
import type { Locale } from "./locale.ts";

/**
 * Formats ICU MessageFormat messages at runtime: text with apostrophe quoting, `{name}`,
 * `{name, number}`, and `plural`, `selectordinal` and `select` with nested messages and `#`
 * (docs/localization.md §3). The catalogs are checked by `pnpm run i18n:check`.
 */

export type MessageArguments = Readonly<Record<string, string | number>>;

type Node =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "pound" }
  | { readonly kind: "argument"; readonly name: string; readonly type: "simple" | "number" }
  | {
      readonly kind: "branch";
      readonly name: string;
      readonly type: "plural" | "selectordinal" | "select";
      readonly offset: number;
      readonly options: ReadonlyMap<string, readonly Node[]>;
    };

function parse(message: string): Node[] {
  let at = 0;
  const fail = (reason: string): never => {
    throw new Error(`${reason} at ${at} in "${message}"`);
  };
  const space = () => {
    while (/\s/.test(message[at] ?? "")) at++;
  };
  const word = () => {
    space();
    const start = at;
    while (at < message.length && !/[\s,{}]/.test(message[at] as string)) at++;
    return message.slice(start, at);
  };

  function nodes(nested: boolean, inBranch: boolean): Node[] {
    const out: Node[] = [];
    let text = "";
    const flush = () => {
      if (text) out.push({ kind: "text", text });
      text = "";
    };
    while (at < message.length) {
      const c = message[at] as string;
      if (c === "'") {
        if (message[at + 1] === "'") {
          text += "'";
          at += 2;
        } else if (/[{}#|]/.test(message[at + 1] ?? "")) {
          const end = message.indexOf("'", at + 1);
          text += message.slice(at + 1, end === -1 ? message.length : end);
          at = end === -1 ? message.length : end + 1;
        } else {
          text += c;
          at++;
        }
      } else if (c === "{") {
        flush();
        at++;
        out.push(argument());
      } else if (c === "}") {
        if (!nested) fail("Unexpected }");
        break;
      } else if (c === "#" && inBranch) {
        flush();
        out.push({ kind: "pound" });
        at++;
      } else {
        text += c;
        at++;
      }
    }
    flush();
    return out;
  }

  function argument(): Node {
    const name = word();
    space();
    if (message[at] === "}") {
      at++;
      return { kind: "argument", name, type: "simple" };
    }
    if (message[at] !== ",") fail("Expected ,");
    at++;
    const type = word();
    space();
    if (type === "number") {
      if (message[at] === ",") fail("Number styles are not supported");
      if (message[at] !== "}") fail("Expected }");
      at++;
      return { kind: "argument", name, type: "number" };
    }
    if (type !== "plural" && type !== "selectordinal" && type !== "select") fail(`Unsupported type ${type}`);
    if (message[at] !== ",") fail("Expected ,");
    at++;
    let offset = 0;
    const options = new Map<string, Node[]>();
    for (;;) {
      space();
      if (message[at] === "}") {
        at++;
        break;
      }
      const selector = word();
      if (selector.startsWith("offset:")) {
        offset = Number(selector.slice(7));
        continue;
      }
      space();
      if (message[at] !== "{") fail("Expected {");
      at++;
      options.set(selector, nodes(true, type !== "select"));
      at++;
    }
    if (!options.has("other")) fail("Missing other");
    return { kind: "branch", name, type: type as "plural", offset, options };
  }

  return nodes(false, false);
}

function render(nodes: readonly Node[], args: MessageArguments, locale: Locale, count?: number): string {
  let out = "";
  for (const node of nodes) {
    if (node.kind === "text") out += node.text;
    else if (node.kind === "pound") out += count === undefined ? "#" : new Intl.NumberFormat(locale).format(count);
    else if (node.kind === "argument") {
      const value = args[node.name];
      if (value === undefined) throw new Error(`Missing argument "${node.name}"`);
      out +=
        node.type === "number" || typeof value === "number"
          ? new Intl.NumberFormat(locale).format(Number(value))
          : value;
    } else {
      const value = args[node.name];
      if (value === undefined) throw new Error(`Missing argument "${node.name}"`);
      let option: readonly Node[] | undefined;
      let pound: number | undefined;
      if (node.type === "select") {
        option = node.options.get(String(value));
      } else {
        const n = Number(value);
        pound = n - node.offset;
        const rules = new Intl.PluralRules(locale, { type: node.type === "plural" ? "cardinal" : "ordinal" });
        option = node.options.get(`=${n}`) ?? node.options.get(rules.select(pound));
      }
      out += render(option ?? (node.options.get("other") as readonly Node[]), args, locale, pound ?? count);
    }
  }
  return out;
}

export type Translate = (key: MessageKey, args?: MessageArguments) => string;

/** A function that formats the messages of a locale; parsed messages are cached. */
export function createTranslator(locale: Locale): Translate {
  const catalog = getCatalog(locale);
  const parsed = new Map<MessageKey, Node[]>();
  return (key, args = {}) => {
    let nodes = parsed.get(key);
    if (!nodes) {
      nodes = parse(catalog.get(key) ?? key);
      parsed.set(key, nodes);
    }
    return render(nodes, args, locale);
  };
}
