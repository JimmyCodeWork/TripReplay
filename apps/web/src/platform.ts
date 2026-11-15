/**
 * Whether this build runs in the Android application (`apps/android`,
 * docs/adr/0008-android-in-1-0.md) rather than in a browser. `vite build --mode native` sets it.
 */
export const NATIVE = import.meta.env.MODE === "native";

/**
 * Whether this build runs in the Windows application (`apps/windows`,
 * docs/adr/0016-windows-application.md), in Microsoft Edge WebView2. `vite build --mode desktop`
 * sets it. Saving, full screen and MCP work as in the browser.
 */
export const DESKTOP = import.meta.env.MODE === "desktop";

/**
 * Whether the page's files come with an installed application, Android or Windows, rather than
 * from a website: there is no service worker, and the licenses are shown in a dialog.
 */
export const PACKAGED = NATIVE || DESKTOP;
