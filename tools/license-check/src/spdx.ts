// Minimal SPDX license expression parser and evaluator.
// Supports identifiers, the "+" suffix, WITH exceptions, AND, OR and parentheses.
// See https://spdx.github.io/spdx-spec/v2.3/SPDX-license-expressions/

export type Expression =
  | { readonly type: "license"; readonly id: string; readonly exception?: string }
  | { readonly type: "and" | "or"; readonly left: Expression; readonly right: Expression };

export class SpdxParseError extends Error {
  override name = "SpdxParseError";
}

const TOKEN = /\s*(\(|\)|[A-Za-z0-9.\-+:]+)/y;

function tokenize(input: string): string[] {
  const tokens: string[] = [];
  TOKEN.lastIndex = 0;
  while (TOKEN.lastIndex < input.length) {
    if (/^\s*$/.test(input.slice(TOKEN.lastIndex))) break;
    const match = TOKEN.exec(input);
    if (!match?.[1]) {
      throw new SpdxParseError(`Unexpected character at position ${TOKEN.lastIndex} in "${input}"`);
    }
    tokens.push(match[1]);
  }
  return tokens;
}

export function parse(input: string): Expression {
  const tokens = tokenize(input);
  let position = 0;

  const peek = (): string | undefined => tokens[position];
  const next = (): string => {
    const token = tokens[position++];
    if (token === undefined) throw new SpdxParseError(`Unexpected end of expression "${input}"`);
    return token;
  };
  const isOperator = (token: string | undefined, operator: string): boolean =>
    token !== undefined && token.toUpperCase() === operator;

  function parseOr(): Expression {
    let left = parseAnd();
    while (isOperator(peek(), "OR")) {
      next();
      left = { type: "or", left, right: parseAnd() };
    }
    return left;
  }

  function parseAnd(): Expression {
    let left = parseAtom();
    while (isOperator(peek(), "AND")) {
      next();
      left = { type: "and", left, right: parseAtom() };
    }
    return left;
  }

  function parseAtom(): Expression {
    const token = next();
    if (token === "(") {
      const inner = parseOr();
      if (next() !== ")") throw new SpdxParseError(`Missing ")" in "${input}"`);
      return inner;
    }
    if (token === ")" || ["AND", "OR", "WITH"].includes(token.toUpperCase())) {
      throw new SpdxParseError(`Unexpected "${token}" in "${input}"`);
    }
    const id = token.endsWith("+") ? token.slice(0, -1) : token;
    if (id.length === 0) throw new SpdxParseError(`Empty license identifier in "${input}"`);
    if (isOperator(peek(), "WITH")) {
      next();
      return { type: "license", id, exception: next() };
    }
    return { type: "license", id };
  }

  const expression = parseOr();
  if (position !== tokens.length) {
    throw new SpdxParseError(`Unexpected "${tokens[position]}" in "${input}"`);
  }
  return expression;
}

// An exception only adds permissions, so a license WITH an exception is
// permitted whenever its base license is.
export function satisfies(expression: Expression, allowed: ReadonlySet<string>): boolean {
  switch (expression.type) {
    case "license":
      return allowed.has(expression.id);
    case "and":
      return satisfies(expression.left, allowed) && satisfies(expression.right, allowed);
    case "or":
      return satisfies(expression.left, allowed) || satisfies(expression.right, allowed);
  }
}
