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

`pnpm run android:build` builds the Android application ([ADR 0008](adr/0008-android-in-1-0.md)): the page with `vite build --mode native` into `apps/web/dist-native`, copied by Capacitor into the Gradle project in `apps/android/android`. Before Gradle packages it, `tools/release/src/android.ts` reads the libraries Gradle resolved for the release build, checks them against the `maven` section of `licenses/inventory.json`, and rewrites the page's `THIRD-PARTY-NOTICES.txt` and `sbom.cdx.json` to cover the Web components, the Capacitor runtime and these libraries. **The build fails** when a library is not reviewed. The application shows the notices under "Open-source licenses".

## 2. Steps

1. On a branch, set the new version in the root `package.json`.
2. Build the release and check the core scenario of the [User Guide](user-guide.md) by hand in Firefox and Safari, which the automated tests do not cover yet, and in the Android application from the CI build of the branch, including a backup and its restore. Record what changed in [Browser Support and Known Issues](browser-support.md) and its translation.
3. In `CHANGELOG.md` and its translation, rename `## [Unreleased]` to `## [x.y.z] - YYYY-MM-DD` and add a new empty `## [Unreleased]` section above it.
4. Open a pull request and merge it once CI passes.
5. Tag the merged commit on `main` and push the tag:

   ```sh
   git tag vx.y.z
   git push origin vx.y.z
   ```

6. The release workflow checks that the tag matches the version, runs `verify`, the build and the browser tests, and publishes a GitHub release with:
   - `tripreplay-web-vx.y.z.zip`: the contents of `apps/web/dist`, ready to serve;
   - `tripreplay-android-vx.y.z.apk`: the Android application, signed with the release key (§4);
   - the SBOM and notices of each: `tripreplay-web-vx.y.z.sbom.cdx.json`, `tripreplay-android-vx.y.z.sbom.cdx.json`, `THIRD-PARTY-NOTICES-web.txt` and `THIRD-PARTY-NOTICES-android.txt`;
   - `SHA256SUMS` of these files.

   The release notes are the version's section of `CHANGELOG.md`. A tag with a hyphen, such as `v0.1.0-beta.1`, is published as a pre-release.

## 3. Deploying

The release archive is a static site with relative paths, so it can be served from any HTTPS location, including a sub-path. The server must send `.webmanifest` files as `application/manifest+json` and must not cache `sw.js` for long, so that browsers find new versions.

## 4. Android Signing Key

Android installs an update only when it is signed with the same key as the installed application. The key is created once, kept in the repository secrets for the release workflow, and backed up outside GitHub. **If it is lost, users must uninstall the application, and with it their trips, to install a new version.**

1. Create the key, with a long password that contains no backslash:

   ```sh
   keytool -genkeypair -v -keystore tripreplay-release.jks -alias tripreplay \
     -keyalg RSA -keysize 4096 -validity 10000
   ```

2. In the repository settings, under **Secrets and variables → Actions**, add:

   | Secret | Value |
   |---|---|
   | `ANDROID_KEYSTORE_BASE64` | The key file in Base64: `base64 -w0 tripreplay-release.jks` |
   | `ANDROID_KEYSTORE_PASSWORD` | The password of the key file |
   | `ANDROID_KEY_ALIAS` | `tripreplay` |
   | `ANDROID_KEY_PASSWORD` | The password of the key (the same unless set otherwise) |

3. Keep `tripreplay-release.jks` and its passwords in a password manager or another safe place, and delete other copies. Never commit them; `.gitignore` excludes key files and `keystore.properties`.

The release workflow fails without these secrets, and checks the signature of the APK with `apksigner` before publishing it.

Test builds from CI are signed instead with a fixed debug key that is public, `apps/android/android/app/debug.keystore`, so that each one installs over the previous one. They are installed as "TripReplay Debug", next to the released application and with their own data. Never sign a release with this key.
