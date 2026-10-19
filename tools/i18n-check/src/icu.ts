// Minimal ICU MessageFormat parser that validates syntax and extracts arguments.
// Covers simple arguments, typed arguments with styles, and plural, selectordinal
// and select arguments with nested messages. Apostrophe quoting follows ICU rules.
// See https://unicode-org.github.io/icu/userguide/format_parse/messages/

export type ArgumentType = "simple" | "number" | "date" | "time" | "plural" | "selectordinal" | "select";

export interface Argument {
  readonly name: string;
  readonly type: ArgumentType;
}

export class IcuParseError extends Error {
  override name = "IcuParseError";
}

const TYPED = new Set<ArgumentType>(["number", "date", "time"]);
const BRANCHING = new Set<ArgumentType>(["plural", "selectordinal", "select"]);
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;

export function parseArguments(message: string): Argument[] {
  const found: Argument[] = [];
  let position = 0;

  const fail = (reason: string): never => {
    throw new IcuParseError(`${reason} at position ${position} in "${message}"`);
  };
  const skipWhitespace = (): void => {
    while (position < message.length && /\s/.test(message[position] ?? "")) position++;
  };
  const readUntil = (stops: string): string => {
    const start = position;
    while (position < message.length && !stops.includes(message[position] ?? "")) position++;
    return message.slice(start, position).trim();
  };

  // Parses text and arguments until an unmatched "}" (when nested) or the end.
  function parseMessage(nested: boolean): void {
    while (position < message.length) {
      const char = message[position];
      if (char === "'") {
        const next = message[position + 1];
        if (next === "'") {
          position += 2;
        } else if (next === "{" || next === "}" || next === "#" || next === "|") {
          const end = message.indexOf("'", position + 1);
          if (end === -1) fail("Unterminated quoted text");
          position = end + 1;
        } else {
          position++;
        }
      } else if (char === "{") {
        position++;
        parseArgument();
      } else if (char === "}") {
        if (!nested) fail('Unexpected "}"');
        return;
      } else {
        position++;
      }
    }
    if (nested) fail('Missing "}"');
  }

  function parseArgument(): void {
    skipWhitespace();
    const name = readUntil(",}");
    if (!NAME.test(name)) fail(`Invalid argument name "${name}"`);
    if (message[position] === "}") {
      position++;
      found.push({ name, type: "simple" });
      return;
    }
    position++; // ","
    const type = readUntil(",}") as ArgumentType;
    if (TYPED.has(type)) {
      if (message[position] === ",") {
        position++;
        readUntil("{}");
        if (message[position] !== "}") fail("Unexpected brace in argument style");
      }
      position++;
      found.push({ name, type });
      return;
    }
    if (!BRANCHING.has(type)) fail(`Unsupported argument type "${type}"`);
    if (message[position] !== ",") fail(`Missing options for "${type}"`);
    position++;
    found.push({ name, type });
    parseOptions(type);
  }

  function parseOptions(type: ArgumentType): void {
    const selectors = new Set<string>();
    skipWhitespace();
    if (type !== "select" && message.startsWith("offset:", position)) {
      position += "offset:".length;
      skipWhitespace();
      readUntil(" \t\n{");
    }
    for (;;) {
      skipWhitespace();
      if (message[position] === "}") {
        position++;
        break;
      }
      const selector = readUntil(" \t\n{}");
      if (selector === "") fail("Missing selector");
      if (selectors.has(selector)) fail(`Duplicate selector "${selector}"`);
      selectors.add(selector);
      skipWhitespace();
      if (message[position] !== "{") fail(`Missing message for selector "${selector}"`);
      position++;
      parseMessage(true);
      position++; // closing "}" of the option
    }
    if (!selectors.has("other")) fail(`"${type}" requires an "other" option`);
  }

  parseMessage(false);
  return found;
}

/** Returns each argument name mapped to its type, or throws if one name is used with two types. */
export function argumentSignature(message: string): Map<string, ArgumentType> {
  const signature = new Map<string, ArgumentType>();
  for (const { name, type } of parseArguments(message)) {
    const existing = signature.get(name);
    if (existing && existing !== type) {
      throw new IcuParseError(`Argument "${name}" is used as both ${existing} and ${type} in "${message}"`);
    }
    signature.set(name, type);
  }
  return signature;
}
