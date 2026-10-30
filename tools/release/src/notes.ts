/**
 * The body of a version's section in a Keep a Changelog file: the lines after
 * "## [version]" up to the next "## " heading, or undefined when there is none.
 */
export function sectionOf(changelog: string, version: string): string | undefined {
  const lines = changelog.split("\n");
  const start = lines.findIndex((line) => line.startsWith(`## [${version}]`));
  if (start < 0) return undefined;
  const end = lines.findIndex((line, i) => i > start && line.startsWith("## "));
  return lines
    .slice(start + 1, end < 0 ? undefined : end)
    .join("\n")
    .trim();
}
