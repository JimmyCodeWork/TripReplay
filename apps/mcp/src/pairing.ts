import { randomInt, timingSafeEqual } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

/**
 * Where the pairing code is kept, so that TripReplay stays paired when the agent starts the server
 * again: the user's configuration directory, readable only by the user.
 */
export function pairingFile(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string {
  if (platform === "win32" && env.APPDATA) return join(env.APPDATA, "TripReplay", "mcp.json");
  const config =
    env.XDG_CONFIG_HOME || join(homedir(), platform === "darwin" ? "Library/Application Support" : ".config");
  return join(config, "TripReplay", "mcp.json");
}

/** Six digits, easy to type into TripReplay. */
function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

/** The pairing code in `file`, made and saved on first use. */
export function loadPairingCode(file: string): string {
  try {
    const { code } = JSON.parse(readFileSync(file, "utf8")) as { code?: unknown };
    if (typeof code === "string" && /^\d{6}$/.test(code)) return code;
  } catch {
    // Missing or unreadable: a new code is made below.
  }
  const code = newCode();
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify({ code })}\n`, { mode: 0o600 });
  return code;
}

/** Compares a code sent by TripReplay with the pairing code without revealing where they differ. */
export function codeMatches(expected: string, given: unknown): boolean {
  if (typeof given !== "string") return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given.replace(/\s/g, ""));
  return a.length === b.length && timingSafeEqual(a, b);
}
