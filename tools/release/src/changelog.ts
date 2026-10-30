// Prints the changelog section of a version, for the release notes.
// Usage: node tools/release/src/changelog.ts <version>

import { readFileSync } from "node:fs";
import { sectionOf } from "./notes.ts";

const version = process.argv[2];
if (!version) {
  console.error("Usage: node tools/release/src/changelog.ts <version>");
  process.exit(1);
}
const section = sectionOf(readFileSync("CHANGELOG.md", "utf8"), version);
if (!section) {
  console.error(`CHANGELOG.md has no section for ${version}`);
  process.exit(1);
}
console.log(section);
