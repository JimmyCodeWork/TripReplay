import { describe, expect, it } from "vitest";
import { compareVersions, isPrerelease, newerRelease, type Release } from "../src/updates.ts";

const release = (tag: string, prerelease = false, draft = false): Release => ({
  tag,
  url: `https://example.com/${tag}`,
  prerelease,
  draft,
});

describe("compareVersions", () => {
  it("orders by Semantic Versioning precedence", () => {
    const ordered = [
      "1.0.0-alpha",
      "1.0.0-alpha.1",
      "1.0.0-beta",
      "1.0.0-beta.2",
      "1.0.0-beta.11",
      "1.0.0-rc.1",
      "1.0.0",
      "1.0.1",
      "1.1.0",
      "2.0.0",
    ];
    for (let i = 1; i < ordered.length; i++) {
      expect(compareVersions(ordered[i - 1] as string, ordered[i] as string)).toBeLessThan(0);
      expect(compareVersions(ordered[i] as string, ordered[i - 1] as string)).toBeGreaterThan(0);
    }
    expect(compareVersions("v1.2.3", "1.2.3+build.5")).toBe(0);
  });

  it("does not compare what is not a version", () => {
    expect(compareVersions("latest", "1.0.0")).toBeUndefined();
    expect(compareVersions("1.0", "1.0.0")).toBeUndefined();
  });

  it("recognizes pre-releases", () => {
    expect(isPrerelease("1.0.0-beta.1")).toBe(true);
    expect(isPrerelease("v1.0.0")).toBe(false);
  });
});

describe("newerRelease", () => {
  const releases = [
    release("v1.0.0"),
    release("v1.1.0-beta.1", true),
    release("v1.0.1"),
    release("v2.0.0", false, true),
    release("nightly"),
  ];

  it("offers the newest finished release to a finished version", () => {
    expect(newerRelease(releases, "1.0.0")?.tag).toBe("v1.0.1");
    expect(newerRelease(releases, "1.0.1")).toBeUndefined();
  });

  it("also offers pre-releases to a pre-release", () => {
    expect(newerRelease(releases, "1.0.0-beta.1")?.tag).toBe("v1.1.0-beta.1");
    expect(newerRelease(releases, "1.1.0-beta.1")).toBeUndefined();
  });

  it("finds nothing among no releases", () => {
    expect(newerRelease([], "0.0.0")).toBeUndefined();
  });
});
