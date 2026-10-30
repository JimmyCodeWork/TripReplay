# Releasing

English | [繁體中文](zh-TW/releasing.md)

| | |
|---|---|
| Date | 2026-10-30 |
| Status | In effect |

How a version of TripReplay is released. The steps meet the release engineering requirements of the [1.0 Definition §6.5](release-1.0.md#65-release-engineering) and the release gate of the [Dependency License Policy §6](license-policy.md#6-release-gate).

## 1. What the build produces

`pnpm run build` writes the Web application to `apps/web/dist`. Besides the application it contains:

| File | Content |
|---|---|
| `THIRD-PARTY-NOTICES.txt` | Every third-party component in the build with its license and full license text; the application links to it |
| `sbom.cdx.json` | The SBOM as CycloneDX 1.5: name, version, package URL, SPDX license and SHA-512 hash of each component |
| `sw.js`, `manifest.webmanifest`, `icons/` | The service worker and manifest that make the application installable and let it start without a connection |

The notices and the SBOM come from the build itself: a Vite plugin (`tools/release`) reads the modules the bundler included, adds the production dependencies of those packages (some, such as `maplibre-gl`, ship a prebuilt bundle that contains them) and the embedded content listed in `licenses/embedded.json`. **The build fails** when a bundled package is not reviewed in `licenses/inventory.json` or declares another license than the one reviewed.

The built page carries a Content Security Policy that allows network access only to the map download source; scripts and workers come only from the site.

## 2. Steps

1. On a branch, set the new version in the root `package.json`.
2. In `CHANGELOG.md` and its translation, rename `## [Unreleased]` to `## [x.y.z] - YYYY-MM-DD` and add a new empty `## [Unreleased]` section above it.
3. Open a pull request and merge it once CI passes.
4. Tag the merged commit on `main` and push the tag:

   ```sh
   git tag vx.y.z
   git push origin vx.y.z
   ```

5. The release workflow checks that the tag matches the version, runs `verify`, the build and the browser tests, and publishes a GitHub release with:
   - `tripreplay-web-vx.y.z.zip`: the contents of `apps/web/dist`, ready to serve;
   - `tripreplay-vx.y.z.sbom.cdx.json` and `THIRD-PARTY-NOTICES.txt`;
   - `SHA256SUMS` of these files.

   The release notes are the version's section of `CHANGELOG.md`. A tag with a hyphen, such as `v0.1.0-beta.1`, is published as a pre-release.

## 3. Deploying

The release archive is a static site with relative paths, so it can be served from any HTTPS location, including a sub-path. The server must send `.webmanifest` files as `application/manifest+json` and must not cache `sw.js` for long, so that browsers find new versions.
