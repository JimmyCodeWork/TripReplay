import { classic } from "./builtin/classic.ts";
import { night } from "./builtin/night.ts";
import { portrait } from "./builtin/portrait.ts";
import type { Theme } from "./model.ts";

export const DEFAULT_THEME_ID = "classic";

/** Bundled themes, in the order shown to the user. */
export const builtinThemes: readonly Theme[] = [classic, night, portrait];

export function findTheme(id: string): Theme | undefined {
  return builtinThemes.find((t) => t.id === id);
}

/** Returns the theme, or the default theme when the id is unknown (for example, from a newer version). */
export function resolveTheme(id: string): Theme {
  return findTheme(id) ?? classic;
}
