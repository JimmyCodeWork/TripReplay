import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { type Boundaries, check, importsOf, type PackageInfo } from "../src/check.ts";

const boundaries: Boundaries = {
  packages: { domain: [], timeline: ["domain"], app: ["domain", "timeline"], web: "*" },
};
const pkg = (name: string, declared: string[] = [], imports: [string, string][] = []): PackageInfo => ({
  name,
  declared,
  imports: imports.map(([file, specifier]) => ({ file, specifier })),
});

describe("check", () => {
  it("passes allowed dependencies and imports", () => {
    const errors = check(boundaries, [
      pkg("domain", [], [["src/index.ts", "./model.ts"]]),
      pkg(
        "timeline",
        ["domain"],
        [
          ["src/compile.ts", "@tripreplay/domain"],
          ["test/a.test.ts", "../src/compile.ts"],
        ],
      ),
      pkg("web", ["app", "timeline"]),
    ]);
    assert.deepEqual(errors, []);
  });

  it("rejects a dependency that points outward", () => {
    assert.match(check(boundaries, [pkg("domain", ["timeline"])]).join("\n"), /domain: may not depend on timeline/);
  });

  it("rejects unlisted packages", () => {
    assert.match(check(boundaries, [pkg("extra")]).join("\n"), /not listed/);
  });

  it("rejects deep, undeclared and self imports", () => {
    const errors = check(boundaries, [
      pkg(
        "app",
        ["domain"],
        [
          ["src/a.ts", "@tripreplay/domain/src/model.ts"],
          ["src/b.ts", "@tripreplay/timeline"],
          ["src/c.ts", "@tripreplay/app"],
        ],
      ),
    ]).join("\n");
    assert.match(errors, /deep import/);
    assert.match(errors, /imports timeline without declaring/);
    assert.match(errors, /imports its own package/);
  });

  it("rejects relative imports that leave the package", () => {
    assert.match(
      check(boundaries, [pkg("app", [], [["src/a.ts", "../../domain/src/model.ts"]])]).join("\n"),
      /leaves the package/,
    );
  });

  it("detects cycles", () => {
    const cyclic: Boundaries = { packages: { a: ["b"], b: ["a"] } };
    assert.match(check(cyclic, [pkg("a", ["b"]), pkg("b", ["a"])]).join("\n"), /cycle: a -> b -> a/);
  });
});

describe("importsOf", () => {
  it("finds static, type-only, re-export, side-effect and dynamic imports", () => {
    const source = [
      'import { a } from "./a.ts";',
      'import type { B } from "@tripreplay/domain";',
      'export * from "./c.ts";',
      'export { d } from "./d.ts";',
      'import "./e.css";',
      'const f = await import("./f.ts");',
      "// not an import: important",
    ].join("\n");
    assert.deepEqual(importsOf(source), ["./a.ts", "@tripreplay/domain", "./c.ts", "./d.ts", "./e.css", "./f.ts"]);
  });
});
