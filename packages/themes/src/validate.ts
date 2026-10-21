import type { Color, Rect, TextAnchor, Theme } from "./model.ts";

const COLOR = /^#[0-9a-f]{6}([0-9a-f]{2})?$/i;
const fraction = (v: number) => Number.isFinite(v) && v >= 0 && v <= 1;

/** Returns a list of problems with a theme definition; empty when the theme is valid. */
export function validateTheme(theme: Theme): string[] {
  const issues: string[] = [];
  const color = (path: string, value: Color | null) => {
    if (value !== null && !COLOR.test(value)) issues.push(`${path}: "${value}" is not a color`);
  };
  const anchor = (path: string, a: TextAnchor) => {
    if (!fraction(a.x) || !fraction(a.y)) issues.push(`${path}: outside the frame`);
  };
  const rect = (path: string, r: Rect) => {
    if (![r.x, r.y, r.width, r.height].every(fraction) || r.x + r.width > 1 || r.y + r.height > 1)
      issues.push(`${path}: outside the frame`);
  };

  if (!/^[a-z][a-z0-9-]*$/.test(theme.id)) issues.push(`id: "${theme.id}" is not a valid id`);
  for (const [group, values] of Object.entries({ map: theme.map, marker: theme.marker, text: theme.text })) {
    for (const [key, value] of Object.entries(values)) color(`${group}.${key}`, value);
  }
  color("route.color", theme.route.color);
  color("route.glow", theme.route.glow);
  color("card.background", theme.card.background);
  color("card.caption", theme.card.caption);
  color("card.shadow", theme.card.shadow);
  for (const [key, value] of Object.entries(theme.typography)) {
    if (typeof value === "number" && key.endsWith("Size") && !(value > 0 && value < 0.5))
      issues.push(`typography.${key}: out of range`);
  }
  for (const [ratio, layout] of Object.entries(theme.layouts)) {
    anchor(`layouts.${ratio}.title`, layout.title);
    anchor(`layouts.${ratio}.stopLabel`, layout.stopLabel);
    anchor(`layouts.${ratio}.attribution`, layout.attribution);
    rect(`layouts.${ratio}.mediaFrame`, layout.mediaFrame);
  }
  for (const [key, value] of Object.entries(theme.timing)) {
    if (!Number.isInteger(value) || value <= 0)
      issues.push(`timing.${key}: must be a positive integer number of microseconds`);
  }
  return issues;
}
