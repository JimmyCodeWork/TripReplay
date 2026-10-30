/** A color as #rrggbb or #rrggbbaa. */
export type Color = string;

/** A rectangle in fractions of the frame, from 0 to 1. */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** A text anchor in fractions of the frame. */
export interface TextAnchor {
  readonly x: number;
  readonly y: number;
  readonly align: "start" | "center" | "end";
}

export interface MapColors {
  readonly background: Color;
  readonly land: Color;
  readonly water: Color;
  readonly park: Color;
  readonly road: Color;
  readonly roadMajor: Color;
}

export interface RouteStyle {
  readonly color: Color;
  /** Line width in fractions of the shorter frame side. */
  readonly width: number;
  /** Glow color, or null for none. */
  readonly glow: Color | null;
}

export interface MarkerStyle {
  readonly visited: Color;
  readonly upcoming: Color;
  readonly outline: Color;
  readonly label: Color;
}

export interface TextStyle {
  readonly color: Color;
  readonly shadow: Color;
}

export interface CardStyle {
  readonly background: Color;
  readonly caption: Color;
  readonly shadow: Color;
  /** Corner radius in fractions of the shorter frame side. */
  readonly radius: number;
}

export interface Typography {
  readonly fontFamily: string;
  /** Font of journal entries and notes in the recap, a serif like a printed diary. */
  readonly journalFontFamily: string;
  readonly titleWeight: number;
  /** Sizes in fractions of the shorter frame side. */
  readonly titleSize: number;
  readonly subtitleSize: number;
  readonly labelSize: number;
  readonly captionSize: number;
}

export interface Layout {
  readonly title: TextAnchor;
  readonly subtitleGap: number;
  readonly mediaFrame: Rect;
  readonly stopLabel: TextAnchor;
  readonly attribution: TextAnchor;
}

/** Durations in microseconds of the recap phases that the theme controls. */
export interface Timing {
  readonly openingUs: number;
  readonly travelUs: number;
  readonly titleUs: number;
  readonly closingUs: number;
  readonly fadeUs: number;
}

export type AspectRatioKey = "16:9" | "9:16";

export interface Theme {
  readonly id: string;
  /** Message catalog keys for the theme's name and description. */
  readonly nameKey: string;
  readonly descriptionKey: string;
  readonly preferredAspectRatio: AspectRatioKey;
  readonly map: MapColors;
  readonly route: RouteStyle;
  readonly marker: MarkerStyle;
  readonly text: TextStyle;
  readonly card: CardStyle;
  readonly typography: Typography;
  readonly layouts: Readonly<Record<AspectRatioKey, Layout>>;
  readonly timing: Timing;
}
