import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkNuget, nugetPurl, publishedPackages } from "../src/nuget.ts";

const assets = {
  libraries: {
    "Microsoft.Web.WebView2/1.0.4314.35": { type: "package" },
    "TripReplay.Windows/1.0.0": { type: "project" },
  },
  project: {
    frameworks: {
      "net10.0-windows7.0": {
        downloadDependencies: [
          { name: "Microsoft.AspNetCore.App.Runtime.win-x64", version: "[10.0.15, 10.0.15]" },
          { name: "Microsoft.NETCore.App.Host.win-x64", version: "[10.0.15, 10.0.15]" },
          { name: "Microsoft.NETCore.App.Runtime.win-x64", version: "[10.0.15, 10.0.15]" },
          { name: "Microsoft.WindowsDesktop.App.Ref", version: "[10.0.15, 10.0.15]" },
          { name: "Microsoft.WindowsDesktop.App.Runtime.win-x64", version: "[10.0.15, 10.0.15]" },
        ],
      },
    },
  },
};

describe("publishedPackages", () => {
  it("lists the packages and the runtime packs a self-contained publish ships", () => {
    assert.deepEqual(publishedPackages(assets), [
      { id: "Microsoft.NETCore.App.Host.win-x64", version: "10.0.15" },
      { id: "Microsoft.NETCore.App.Runtime.win-x64", version: "10.0.15" },
      { id: "Microsoft.Web.WebView2", version: "1.0.4314.35" },
      { id: "Microsoft.WindowsDesktop.App.Runtime.win-x64", version: "10.0.15" },
    ]);
    assert.equal(
      nugetPurl({ id: "Microsoft.Web.WebView2", version: "1.0.4314.35" }),
      "pkg:nuget/Microsoft.Web.WebView2@1.0.4314.35",
    );
  });
});

describe("checkNuget", () => {
  const allowed = { code: ["MIT", "BSD-3-Clause"], asset: [] };
  const packages = publishedPackages(assets);
  const reviewed = Object.fromEntries(
    packages.map((p) => [`${p.id}@${p.version}`, { declared: "MIT", category: "code" as const }]),
  );

  it("passes reviewed packages under permitted licenses", () => {
    assert.deepEqual(checkNuget(packages, reviewed, allowed), []);
  });

  it("stops at unreviewed packages, licenses not permitted and stale reviews", () => {
    const { "Microsoft.Web.WebView2@1.0.4314.35": _, ...missing } = reviewed;
    assert.deepEqual(checkNuget(packages, missing, allowed), [
      'Microsoft.Web.WebView2@1.0.4314.35 is in the Windows application but not reviewed in the "nuget" section of licenses/inventory.json',
    ]);
    const mpl = {
      ...reviewed,
      "Microsoft.Web.WebView2@1.0.4314.35": { declared: "MPL-2.0", category: "code" as const },
    };
    assert.deepEqual(checkNuget(packages, mpl, allowed), [
      'Microsoft.Web.WebView2@1.0.4314.35 (MPL-2.0) is not permitted for category "code"',
    ]);
    const stale = { ...reviewed, "Old@1.0.0": { declared: "MIT", category: "code" as const } };
    assert.deepEqual(checkNuget(packages, stale, allowed), [
      "Old@1.0.0 is reviewed but no longer in the Windows application; remove the entry",
    ]);
  });
});
