import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type CheckInput, check, type Inventory } from "../src/check.ts";

const policy = { allowed: { code: ["MIT", "ISC"], asset: ["OFL-1.1"] } };
const emptyInventory: Inventory = { release: {}, development: [] };

function run(overrides: Partial<CheckInput>): string[] {
  return check({ policy, inventory: emptyInventory, production: [], directDevelopment: [], ...overrides });
}

describe("check", () => {
  it("passes when nothing is installed", () => {
    assert.deepEqual(run({}), []);
  });

  it("passes a reviewed package with a permitted license", () => {
    const errors = run({
      inventory: { release: { "earcut@3.0.2": { declared: "ISC", category: "code" } }, development: [] },
      production: [{ name: "earcut", version: "3.0.2", license: "ISC" }],
    });
    assert.deepEqual(errors, []);
  });

  it("fails an unreviewed package", () => {
    const errors = run({ production: [{ name: "left-pad", version: "1.3.0", license: "MIT" }] });
    assert.match(errors[0] ?? "", /left-pad@1\.3\.0.*not reviewed/);
  });

  it("fails a reviewed package with a prohibited license", () => {
    const errors = run({
      inventory: { release: { "mediabunny@1.0.0": { declared: "MPL-2.0", category: "code" } }, development: [] },
      production: [{ name: "mediabunny", version: "1.0.0", license: "MPL-2.0" }],
    });
    assert.match(errors[0] ?? "", /not permitted/);
  });

  it("fails when the declared license changes", () => {
    const errors = run({
      inventory: { release: { "x@2.0.0": { declared: "MIT", category: "code" } }, development: [] },
      production: [{ name: "x", version: "2.0.0", license: "BUSL-1.1" }],
    });
    assert.match(errors[0] ?? "", /declared license changed/);
  });

  it("permits asset licenses only for assets", () => {
    const font = [{ name: "font", version: "1.0.0", license: "OFL-1.1" }];
    const asCode = run({
      inventory: { release: { "font@1.0.0": { declared: "OFL-1.1", category: "code" } }, development: [] },
      production: font,
    });
    const asAsset = run({
      inventory: { release: { "font@1.0.0": { declared: "OFL-1.1", category: "asset" } }, development: [] },
      production: font,
    });
    assert.equal(asCode.length, 1);
    assert.deepEqual(asAsset, []);
  });

  it("uses the resolved expression for non-SPDX declarations", () => {
    const production = [{ name: "legacy", version: "0.1.0", license: "MIT/X11" }];
    const unresolved = run({
      inventory: { release: { "legacy@0.1.0": { declared: "MIT/X11", category: "code" } }, development: [] },
      production,
    });
    const resolved = run({
      inventory: {
        release: { "legacy@0.1.0": { declared: "MIT/X11", resolved: "MIT", category: "code" } },
        development: [],
      },
      production,
    });
    assert.match(unresolved[0] ?? "", /not a valid SPDX expression/);
    assert.deepEqual(resolved, []);
  });

  it("fails stale inventory entries", () => {
    const errors = run({
      inventory: { release: { "gone@1.0.0": { declared: "MIT", category: "code" } }, development: ["old-tool"] },
    });
    assert.equal(errors.length, 2);
  });

  it("fails unapproved development dependencies", () => {
    const errors = run({ directDevelopment: ["some-tool"] });
    assert.match(errors[0] ?? "", /some-tool: development dependency not approved/);
  });
});
