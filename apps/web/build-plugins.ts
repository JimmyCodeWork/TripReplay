// Build-time pieces of the deployed site (docs/release-1.0.md §6.5): the Content Security Policy
// and the service worker that makes the installed application start without a connection.

import { createHash } from "node:crypto";
import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import type { Plugin } from "vite";

/** The only host the application talks to: the public map download source (ADR 0006). */
export const MAP_SOURCE = "https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com";

/**
 * The Content Security Policy. Scripts and workers come only from the site; network access is
 * limited to the map download source; media is shown from blob: URLs of stored files. Inline
 * styles are allowed because React and MapLibre set style attributes.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "worker-src 'self' blob:",
  `connect-src 'self' ${MAP_SOURCE} blob: data:`,
  "img-src 'self' blob: data:",
  "media-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
].join("; ");

/** Adds the policy to the built page only; the development server needs inline scripts and WebSockets. */
export function contentSecurityPolicy(): Plugin {
  return {
    name: "tripreplay-csp",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: CONTENT_SECURITY_POLICY },
        injectTo: "head-prepend",
      },
    ],
  };
}

function listFiles(directory: string, base = directory): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path, base) : [relative(base, path).replace(/\\/g, "/")];
  });
}

/**
 * The service worker source: it stores every file of the build when installed and answers from
 * that copy, so the application starts offline (docs/specification.md §4). Other requests, such
 * as map downloads, go to the network untouched.
 */
export function serviceWorkerSource(files: readonly string[], version: string): string {
  return `// Generated at build time; see apps/web/build-plugins.ts.
const CACHE = "tripreplay-${version}";
const FILES = ${JSON.stringify(["./", ...files], null, 2)};

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key.startsWith("tripreplay-") && key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.open(CACHE).then(async (cache) => {
      const cached = await cache.match(request.mode === "navigate" ? "./" : request, { ignoreSearch: true });
      return cached ?? fetch(request);
    }),
  );
});
`;
}

/** Emits sw.js with the list of every file of the build, versioned by their names. */
export function serviceWorker(publicDir: string): Plugin {
  return {
    name: "tripreplay-service-worker",
    apply: "build",
    generateBundle(_options, bundle) {
      const files = [...Object.keys(bundle), ...listFiles(publicDir)].filter((f) => f !== "sw.js").sort();
      // Built file names carry content hashes, so their list identifies the version.
      const version = createHash("sha256").update(files.join("\n")).digest("hex").slice(0, 12);
      this.emitFile({ type: "asset", fileName: "sw.js", source: serviceWorkerSource(files, version) });
    },
  };
}
