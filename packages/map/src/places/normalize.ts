import { SIMPLIFIED_PAIRS, VARIANT_PAIRS } from "./variants.ts";

const FOLD = new Map<string, string>();
for (const line of VARIANT_PAIRS) {
  const chars = Array.from(line);
  for (let i = 0; i + 1 < chars.length; i += 2) FOLD.set(chars[i] as string, chars[i + 1] as string);
}

const SEPARATOR = /[\s\p{P}\p{S}]/u;

function fold(text: string): string {
  let out = "";
  for (const c of text.normalize("NFKC").toLowerCase()) {
    if (!SEPARATOR.test(c)) out += FOLD.get(c) ?? c;
  }
  return out;
}

/** Simplified characters that the variant table maps to one Traditional form; others stay as they are. */
const SIMPLIFIED_TO_TRADITIONAL = new Map<string, string>();
for (const line of SIMPLIFIED_PAIRS) {
  const chars = Array.from(line);
  for (let i = 0; i + 1 < chars.length; i += 2)
    SIMPLIFIED_TO_TRADITIONAL.set(chars[i] as string, chars[i + 1] as string);
}

/**
 * Converts Simplified Chinese to Traditional character by character, for names that the map only
 * has in Simplified Chinese (圣淘沙 → 聖淘沙). Words with several Traditional forms take the most
 * common one, which suits place names; Japanese forms are not changed.
 */
export function toTraditional(text: string): string {
  let out = "";
  for (const c of text) out += SIMPLIFIED_TO_TRADITIONAL.get(c) ?? c;
  return out;
}

/**
 * Words that mean the same in Chinese and Japanese but are written differently, so that 京都車站
 * finds 京都駅. Applied after folding; longer words first.
 */
const EQUIVALENT_WORDS: readonly [string, string][] = (
  [
    ["火車站", "站"],
    ["車站", "站"],
    ["駅", "站"],
    ["機場", "空港"],
  ] as const
).map(([word, replacement]) => [fold(word), fold(replacement)]);

/**
 * The form in which names and queries are compared: NFKC, lower case, without spaces, punctuation
 * and symbols, with variant characters folded (臺/台, 稻/稲, 條/条) and equivalent words unified.
 */
export function normalize(text: string): string {
  let out = fold(text);
  for (const [word, replacement] of EQUIVALENT_WORDS) out = out.replaceAll(word, replacement);
  return out;
}

const AIRPORT = normalize("機場");
const INTERNATIONAL = normalize("國際");

/**
 * The normalized forms a query is searched in: the query itself and, for an airport named
 * without "international", the form with it, which people usually leave out: 桃園機場 finds
 * 臺灣桃園國際機場. Done at search time, so that stored indexes stay valid.
 */
export function queryForms(query: string): string[] {
  const q = normalize(query);
  const at = q.indexOf(AIRPORT);
  if (q === "" || at <= 0 || q.slice(0, at).endsWith(INTERNATIONAL)) return q === "" ? [] : [q];
  return [q, q.slice(0, at) + INTERNATIONAL + q.slice(at)];
}

/** Overlapping two-character sequences of a normalized key; a one-character key is its own sequence. */
export function bigrams(key: string): string[] {
  const chars = Array.from(key);
  if (chars.length < 2) return chars;
  return chars.slice(0, -1).map((c, i) => c + chars[i + 1]);
}
