/**
 * Whether this build runs in the Android application (`apps/android`,
 * docs/adr/0008-android-in-1-0.md) rather than in a browser. `vite build --mode native` sets it.
 */
export const NATIVE = import.meta.env.MODE === "native";
