import { useSyncExternalStore } from "react";

/**
 * The user's settings, kept in the browser's local storage under the keys they had before the
 * Settings dialog gathered them (docs/ui-design.md §2.2).
 */
export interface Settings {
  /** "Reduce motion"; undefined follows the system setting. */
  readonly reducedMotion: boolean | undefined;
  /** Whether playing first loads the map along the recap (docs/adr/0014-load-map-before-playing.md). */
  readonly preloadMap: boolean;
  /** Within how many kilometres of a stop the detailed map is loaded first; undefined for the whole path. */
  readonly preloadNearKm: number | undefined;
  /** Whether imports make photos smaller (docs/adr/0011-smaller-media.md). */
  readonly shrinkPhotos: boolean;
  /** Whether imports make videos smaller; slow, so off until turned on. */
  readonly shrinkVideos: boolean;
  /** Whether the browser's AI agent may use the open trip (docs/adr/0010-agent-tools.md). */
  readonly agentTools: boolean;
  /** Whether TripReplay connects to the MCP server on this computer (docs/adr/0012-mcp-server.md). */
  readonly mcp: boolean;
  /** The MCP pairing code the user entered; empty until then. */
  readonly mcpCode: string;
  /** How the Journal tab shows the journal: one stop or one day at a time. */
  readonly journalView: "stop" | "day";
}

/** The distances offered for loading the detailed map first, in kilometres. */
export const PRELOAD_NEAR_KM = [10, 25, 50, 100] as const;

const DEFAULTS: Settings = {
  reducedMotion: undefined,
  preloadMap: true,
  preloadNearKm: 25,
  shrinkPhotos: true,
  shrinkVideos: false,
  agentTools: false,
  mcp: false,
  mcpCode: "",
  journalView: "stop",
};

const KEYS: Record<keyof Settings, string> = {
  reducedMotion: "tripreplay.reducedMotion",
  preloadMap: "tripreplay.preloadMap",
  preloadNearKm: "tripreplay.preloadNearKm",
  shrinkPhotos: "tripreplay.shrinkPhotos",
  shrinkVideos: "tripreplay.shrinkVideos",
  agentTools: "tripreplay.agentTools",
  mcp: "tripreplay.mcp",
  mcpCode: "tripreplay.mcpCode",
  journalView: "tripreplay.journalView",
};

/** Turns a stored text into a setting's value, or undefined where it holds none or a wrong one. */
function parse<K extends keyof Settings>(key: K, text: string): Settings[K] | undefined {
  switch (key) {
    case "mcpCode":
      return text as Settings[K];
    case "journalView":
      return (text === "day" || text === "stop" ? text : undefined) as Settings[K] | undefined;
    case "preloadNearKm":
      if (text === "all") return undefined;
      return (PRELOAD_NEAR_KM.includes(Number(text) as never) ? Number(text) : DEFAULTS.preloadNearKm) as Settings[K];
    default:
      return (text === "true" ? true : text === "false" ? false : undefined) as Settings[K] | undefined;
  }
}

function format(key: keyof Settings, value: Settings[keyof Settings]): string | null {
  if (key === "preloadNearKm") return value === undefined ? "all" : String(value);
  if (value === undefined || (key === "mcpCode" && value === "")) return null;
  return String(value);
}

/** Reads the settings from `storage`, with the defaults for those not stored or unreadable. */
export function readSettings(storage: Pick<Storage, "getItem"> | undefined): Settings {
  const settings: Record<string, unknown> = { ...DEFAULTS };
  for (const key of Object.keys(KEYS) as (keyof Settings)[]) {
    let text: string | null = null;
    try {
      text = storage?.getItem(KEYS[key]) ?? null;
    } catch {
      // Storage can be unavailable, for example in a private window.
    }
    if (text === null) continue;
    const value = parse(key, text);
    if (value !== undefined || key === "preloadNearKm") settings[key] = value;
  }
  return settings as unknown as Settings;
}

/** Writes changed settings to `storage`; a removed value is removed. */
export function writeSettings(
  storage: Pick<Storage, "setItem" | "removeItem"> | undefined,
  changes: Partial<Settings>,
) {
  for (const [key, value] of Object.entries(changes) as [keyof Settings, Settings[keyof Settings]][]) {
    try {
      const text = format(key, value);
      if (text === null) storage?.removeItem(KEYS[key]);
      else storage?.setItem(KEYS[key], text);
    } catch {
      // Storage can be unavailable, for example in a private window; the choice then lasts for this visit.
    }
  }
}

function browserStorage(): Storage | undefined {
  try {
    return localStorage;
  } catch {
    return undefined;
  }
}

let current: Settings | undefined;
const listeners = new Set<() => void>();

function snapshot(): Settings {
  current ??= readSettings(browserStorage());
  return current;
}

/** Changes settings for the whole application and keeps them in the browser. */
export function updateSettings(changes: Partial<Settings>): void {
  current = { ...snapshot(), ...changes };
  writeSettings(browserStorage(), changes);
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The current settings, updated wherever they are changed. */
export function useSettings(): Settings {
  return useSyncExternalStore(subscribe, snapshot);
}
