/** The browser features TripReplay needs (ADR 0007, decision 3); missing ones are listed. */
export function missingFeatures(): string[] {
  const missing: string[] = [];
  if (typeof indexedDB === "undefined") missing.push("IndexedDB");
  if (typeof navigator.storage?.getDirectory !== "function") missing.push("OPFS");
  if (!document.createElement("canvas").getContext("webgl2")) missing.push("WebGL 2");
  return missing;
}
