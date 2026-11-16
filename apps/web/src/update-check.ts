import { newerRelease, type Release } from "@tripreplay/app";
import { PACKAGED } from "./platform.ts";

/** TripReplay's version, from the root package.json. */
export const APP_VERSION = __TRIPREPLAY_VERSION__;

/** What a check for updates found (docs/ui-design.md §2.2). */
export type UpdateResult =
  | { readonly kind: "upToDate" }
  /** The Web application: the service worker has the new version; reloading uses it. */
  | { readonly kind: "ready" }
  /** The Android and Windows applications: a newer release to download from its page. */
  | { readonly kind: "available"; readonly version: string; readonly url: string }
  /** No release has been published yet. */
  | { readonly kind: "noReleases" }
  | { readonly kind: "failed" };

// The service worker takes over open pages as soon as a new version is installed, but the page
// keeps the files it started with until it is reloaded. A change of controller after the start
// means that a newer version waits for a reload; the first controller of a first visit does not.
let replaced = false;
if (!PACKAGED && typeof navigator !== "undefined" && navigator.serviceWorker?.controller) {
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    replaced = true;
  });
}

/** Asks the service worker to look for a new version of the site, and waits until it is in use. */
async function checkSite(): Promise<UpdateResult> {
  if (replaced) return { kind: "ready" };
  const registration = await navigator.serviceWorker?.getRegistration();
  if (!registration) return { kind: "failed" };
  await registration.update();
  const worker = registration.installing ?? registration.waiting;
  if (!worker) return { kind: "upToDate" };
  return new Promise((resolve) => {
    const settle = () => {
      if (worker.state === "activated") resolve({ kind: "ready" });
      else if (worker.state === "redundant") resolve({ kind: "failed" });
    };
    worker.addEventListener("statechange", settle);
    settle();
  });
}

/** Asks GitHub for the project's releases and compares them with this version. */
async function checkReleases(): Promise<UpdateResult> {
  const response = await fetch(__TRIPREPLAY_RELEASES__, {
    headers: { Accept: "application/vnd.github+json" },
    cache: "no-store",
  });
  if (!response.ok) return { kind: "failed" };
  const list = (await response.json()) as readonly {
    tag_name: string;
    html_url: string;
    prerelease: boolean;
    draft: boolean;
  }[];
  const releases: Release[] = list.map((entry) => ({
    tag: entry.tag_name,
    url: entry.html_url,
    prerelease: entry.prerelease,
    draft: entry.draft,
  }));
  if (!releases.some((release) => !release.draft)) return { kind: "noReleases" };
  const newer = newerRelease(releases, APP_VERSION);
  return newer ? { kind: "available", version: newer.tag.replace(/^v/, ""), url: newer.url } : { kind: "upToDate" };
}

/**
 * Checks for a newer version, only when the user asks: the Web application through its service
 * worker, the Android and Windows applications, whose files are in their packages, against the
 * releases on GitHub.
 */
export async function checkForUpdate(): Promise<UpdateResult> {
  try {
    return await (PACKAGED ? checkReleases() : checkSite());
  } catch {
    return { kind: "failed" };
  }
}
