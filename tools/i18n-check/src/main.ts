// Verifies the message catalogs against the rules in docs/localization.md §3.
// Run from the repository root.

import { readdirSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { type Catalog, check, type SourceEntry, type TranslationEntry } from "./check.ts";

const directory = join(process.cwd(), "packages/i18n/locales");
const sourceLocale = "en";

function readCatalog<T>(locale: string): Catalog<T> {
  return JSON.parse(readFileSync(join(directory, `${locale}.json`), "utf8")) as Catalog<T>;
}

const translations: Record<string, Catalog<TranslationEntry>> = {};
for (const file of readdirSync(directory).filter((name) => name.endsWith(".json"))) {
  const locale = basename(file, ".json");
  if (locale !== sourceLocale) translations[locale] = readCatalog<TranslationEntry>(locale);
}

const { errors, pending } = check(readCatalog<SourceEntry>(sourceLocale), translations);

if (pending.length > 0) {
  console.log(`${pending.length} translation(s) pending; English is shown until translated:`);
  for (const entry of pending) console.log(`  - ${entry}`);
}
if (errors.length > 0) {
  console.error(`Localization check failed with ${errors.length} problem(s):\n`);
  for (const error of errors) console.error(`  - ${error}`);
  console.error("\nSee docs/localization.md.");
  process.exit(1);
}
console.log("Localization check passed.");
