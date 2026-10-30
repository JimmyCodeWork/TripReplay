import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { checkMaven, mavenPurl, parseGradleDependencies } from "../src/maven.ts";

const report = [
  "releaseRuntimeClasspath - Runtime classpath of '/release'.",
  "+--- project :capacitor-android",
  "|    +--- androidx.appcompat:appcompat:1.7.1",
  "|    |    +--- androidx.activity:activity:1.8.0 -> 1.11.0",
  "|    |    |    \\--- androidx.annotation:annotation:1.1.0 -> 1.9.1 (*)",
  "|    |    \\--- androidx.lifecycle:lifecycle-runtime:2.6.1 (c)",
  "|    \\--- org.apache.cordova:framework:14.0.1",
  "+--- androidx.core:core:{strictly 1.17.0} -> 1.17.0",
  "+--- androidx.webkit:webkit -> 1.14.0",
  "+--- com.example:unresolved:1.0 (n)",
  "\\--- project :capacitor-cordova-android-plugins",
].join("\n");

describe("parseGradleDependencies", () => {
  it("lists each resolved library once at the version Gradle chose", () => {
    assert.deepEqual(
      parseGradleDependencies(report).map((l) => `${l.group}:${l.artifact}:${l.version}`),
      [
        "androidx.activity:activity:1.11.0",
        "androidx.annotation:annotation:1.9.1",
        "androidx.appcompat:appcompat:1.7.1",
        "androidx.core:core:1.17.0",
        "androidx.webkit:webkit:1.14.0",
        "org.apache.cordova:framework:14.0.1",
      ],
    );
  });

  it("names Maven libraries with package URLs", () => {
    assert.equal(
      mavenPurl({ group: "androidx.core", artifact: "core", version: "1.17.0" }),
      "pkg:maven/androidx.core/core@1.17.0",
    );
  });
});

describe("checkMaven", () => {
  const allowed = { code: ["Apache-2.0", "MIT"], asset: ["CC0-1.0"] };
  const core = { group: "androidx.core", artifact: "core", version: "1.17.0" };

  it("passes reviewed libraries with permitted licenses", () => {
    assert.deepEqual(
      checkMaven([core], { "androidx.core:core@1.17.0": { declared: "Apache-2.0", category: "code" } }, allowed),
      [],
    );
  });

  it("reports unreviewed and not permitted libraries, and stale reviews", () => {
    const junit = { group: "junit", artifact: "junit", version: "4.13.2" };
    assert.deepEqual(
      checkMaven(
        [core, junit],
        {
          "junit:junit@4.13.2": { declared: "EPL-1.0", category: "code" },
          "androidx.core:core@1.16.0": { declared: "Apache-2.0", category: "code" },
        },
        allowed,
      ),
      [
        'androidx.core:core@1.17.0 is in the Android application but not reviewed in the "maven" section of licenses/inventory.json',
        'junit:junit@4.13.2 (EPL-1.0) is not permitted for category "code"',
        "androidx.core:core@1.16.0 is reviewed but no longer in the Android application; remove the entry",
      ],
    );
  });
});
