import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sectionOf } from "../src/notes.ts";
import {
  type Component,
  lockfileIntegrity,
  packageOfModule,
  renderNotices,
  renderSbom,
  unreviewed,
} from "../src/notices.ts";

const pmtiles: Component = {
  name: "pmtiles",
  version: "4.5.0",
  license: "BSD-3-Clause",
  licenseText: "Copyright 2021 Protomaps LLC\n\nBSD 3-Clause License text",
  homepage: "https://github.com/protomaps/PMTiles",
  type: "library",
  integrity: "sha512-AAEC",
};
const scoped: Component = {
  name: "@mapbox/vector-tile",
  version: "3.0.0",
  license: "BSD-3-Clause",
  licenseText: "Copyright 2021 Protomaps LLC\n\nBSD 3-Clause License text",
  type: "library",
};
const opencc: Component = {
  name: "OpenCC dictionaries",
  version: "9e9d730",
  license: "Apache-2.0",
  licenseText: "Apache License 2.0",
  usedIn: "packages/map/src/places/variants.ts",
  type: "data",
};

describe("packageOfModule", () => {
  it("finds the package of a module in pnpm's layout, with its scope", () => {
    assert.deepEqual(packageOfModule("/repo/node_modules/.pnpm/pmtiles@4.5.0/node_modules/pmtiles/dist/index.js"), {
      name: "pmtiles",
      root: "/repo/node_modules/.pnpm/pmtiles@4.5.0/node_modules/pmtiles",
    });
    assert.equal(
      packageOfModule(
        "/repo/node_modules/.pnpm/@mapbox+vector-tile@3.0.0/node_modules/@mapbox/vector-tile/index.js?commonjs",
      )?.name,
      "@mapbox/vector-tile",
    );
  });

  it("leaves the project's own modules and virtual modules out", () => {
    assert.equal(packageOfModule("/repo/packages/map/src/index.ts"), undefined);
    assert.equal(packageOfModule("\0vite/preload-helper.js"), undefined);
  });
});

describe("lockfileIntegrity", () => {
  it("reads the integrity of plain and scoped packages", () => {
    const lockfile = [
      "packages:",
      "",
      "  '@mapbox/vector-tile@3.0.0':",
      "    resolution: {integrity: sha512-xyz==}",
      "",
      "  pmtiles@4.5.0:",
      "    resolution: {integrity: sha512-abc==}",
      "    engines: {node: '>=18'}",
    ].join("\n");
    const integrity = lockfileIntegrity(lockfile);
    assert.equal(integrity.get("@mapbox/vector-tile@3.0.0"), "sha512-xyz==");
    assert.equal(integrity.get("pmtiles@4.5.0"), "sha512-abc==");
  });
});

describe("unreviewed", () => {
  it("reports bundled packages that were not reviewed or changed their license", () => {
    const inventory = {
      release: { "pmtiles@4.5.0": { declared: "BSD-3-Clause" }, "@mapbox/vector-tile@3.0.0": { declared: "MIT" } },
    };
    assert.deepEqual(unreviewed([pmtiles, scoped, opencc], inventory), [
      '@mapbox/vector-tile@3.0.0 declares "BSD-3-Clause", reviewed as "MIT"',
    ]);
    assert.deepEqual(unreviewed([pmtiles], { release: {} }), [
      "pmtiles@4.5.0 (BSD-3-Clause) is bundled but not reviewed in licenses/inventory.json",
    ]);
  });
});

describe("renderNotices", () => {
  it("lists every component with its license, printing a shared text once", () => {
    const text = renderNotices("TripReplay", [pmtiles, opencc, scoped]);
    const order = ["@mapbox/vector-tile 3.0.0", "OpenCC dictionaries 9e9d730", "pmtiles 4.5.0"].map((n) =>
      text.indexOf(n),
    );
    assert.deepEqual(
      [...order].sort((a, b) => a - b),
      order,
    );
    assert.equal(text.split("BSD 3-Clause License text").length, 2);
    assert.match(text, /\(Same license text as @mapbox\/vector-tile 3\.0\.0\.\)/);
    assert.match(text, /Used in: packages\/map\/src\/places\/variants\.ts/);
    assert.match(text, /OpenStreetMap contributors, Overture Maps Foundation/);
  });
});

describe("renderSbom", () => {
  it("writes CycloneDX with package URLs, licenses and hashes", () => {
    const sbom = renderSbom({
      product: "TripReplay",
      version: "0.1.0",
      components: [pmtiles, scoped, opencc],
      serial: "00000000-0000-4000-8000-000000000000",
      timestamp: "2026-10-30T00:00:00.000Z",
    }) as { bomFormat: string; specVersion: string; components: Record<string, unknown>[] };
    assert.equal(sbom.bomFormat, "CycloneDX");
    assert.equal(sbom.specVersion, "1.5");
    const [vectorTile, data, tiles] = sbom.components;
    assert.equal(vectorTile?.purl, "pkg:npm/%40mapbox/vector-tile@3.0.0");
    assert.deepEqual(tiles?.hashes, [{ alg: "SHA-512", content: "000102" }]);
    assert.deepEqual(data?.licenses, [{ license: { id: "Apache-2.0" } }]);
    assert.equal(data?.type, "data");
  });
});

describe("sectionOf", () => {
  const changelog = [
    "# Changelog",
    "",
    "## [Unreleased]",
    "",
    "## [0.1.0] - 2026-11-01",
    "",
    "### Added",
    "",
    "- Maps",
    "",
    "## [0.0.1]",
    "- old",
  ].join("\n");

  it("returns a version's section without its heading", () => {
    assert.equal(sectionOf(changelog, "0.1.0"), "### Added\n\n- Maps");
    assert.equal(sectionOf(changelog, "0.0.1"), "- old");
    assert.equal(sectionOf(changelog, "9.9.9"), undefined);
  });
});
