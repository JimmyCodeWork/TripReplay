import { argumentSignature, IcuParseError } from "./icu.ts";

export interface SourceEntry {
  readonly message: string;
  readonly description?: string;
}

export interface TranslationEntry {
  readonly message?: string;
  /** True while the translation is outstanding; the source message is shown instead. */
  readonly pending?: boolean;
}

export type Catalog<T> = Readonly<Record<string, T>>;

export interface CheckResult {
  readonly errors: string[];
  readonly pending: string[];
}

const KEY = /^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9]*)+$/;

function describe(signature: Map<string, string>): string {
  return [...signature].map(([name, type]) => `${name}:${type}`).join(", ") || "none";
}

export function check(
  source: Catalog<SourceEntry>,
  translations: Readonly<Record<string, Catalog<TranslationEntry>>>,
): CheckResult {
  const errors: string[] = [];
  const pending: string[] = [];
  const signatures = new Map<string, Map<string, string>>();

  for (const [key, entry] of Object.entries(source)) {
    if (!KEY.test(key)) errors.push(`en: "${key}" is not a valid key (use dot-separated camelCase segments).`);
    if (typeof entry?.message !== "string" || entry.message === "") {
      errors.push(`en: "${key}" has no message.`);
      continue;
    }
    try {
      signatures.set(key, argumentSignature(entry.message));
    } catch (error) {
      if (!(error instanceof IcuParseError)) throw error;
      errors.push(`en: "${key}": ${error.message}`);
    }
  }

  for (const [locale, catalog] of Object.entries(translations)) {
    for (const key of Object.keys(source)) {
      if (!(key in catalog)) errors.push(`${locale}: "${key}" is missing.`);
    }
    for (const [key, entry] of Object.entries(catalog)) {
      if (!(key in source)) {
        errors.push(`${locale}: "${key}" does not exist in en. Remove it.`);
        continue;
      }
      if (entry?.pending === true) {
        if (entry.message !== undefined) errors.push(`${locale}: "${key}" is pending but has a message.`);
        pending.push(`${locale}: ${key}`);
        continue;
      }
      if (typeof entry?.message !== "string" || entry.message === "") {
        errors.push(`${locale}: "${key}" has no message. Translate it or mark it as pending.`);
        continue;
      }
      const expected = signatures.get(key);
      try {
        const actual = argumentSignature(entry.message);
        if (expected && describe(actual) !== describe(expected)) {
          errors.push(`${locale}: "${key}" has arguments [${describe(actual)}], expected [${describe(expected)}].`);
        }
      } catch (error) {
        if (!(error instanceof IcuParseError)) throw error;
        errors.push(`${locale}: "${key}": ${error.message}`);
      }
    }
  }

  return { errors: errors.sort(), pending: pending.sort() };
}
