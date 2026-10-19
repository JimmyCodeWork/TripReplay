import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parse, SpdxParseError, satisfies } from "../src/spdx.ts";

const allowed = new Set(["MIT", "Apache-2.0", "Unicode-3.0", "ISC"]);
const permits = (expression: string): boolean => satisfies(parse(expression), allowed);

describe("parse", () => {
  it("parses a single identifier", () => {
    assert.deepEqual(parse("MIT"), { type: "license", id: "MIT" });
  });

  it("gives AND higher precedence than OR", () => {
    assert.deepEqual(parse("MIT OR ISC AND Zlib"), {
      type: "or",
      left: { type: "license", id: "MIT" },
      right: { type: "and", left: { type: "license", id: "ISC" }, right: { type: "license", id: "Zlib" } },
    });
  });

  it("strips the or-later suffix and keeps exceptions", () => {
    assert.deepEqual(parse("Apache-2.0+ WITH LLVM-exception"), {
      type: "license",
      id: "Apache-2.0",
      exception: "LLVM-exception",
    });
  });

  for (const invalid of ["", "MIT OR", "(MIT", "MIT)", "AND MIT", "MIT/X11", "MIT MIT"]) {
    it(`rejects ${JSON.stringify(invalid)}`, () => {
      assert.throws(() => parse(invalid), SpdxParseError);
    });
  }
});

describe("satisfies", () => {
  it("permits an allowed identifier", () => assert.equal(permits("MIT"), true));
  it("rejects a prohibited identifier", () => assert.equal(permits("MPL-2.0"), false));
  it("permits OR when one option is allowed", () => assert.equal(permits("(MIT OR GPL-3.0-or-later)"), true));
  it("rejects OR when no option is allowed", () => assert.equal(permits("GPL-2.0 OR LGPL-2.1"), false));
  it("permits AND when every term is allowed", () => {
    assert.equal(permits("(MIT OR Apache-2.0) AND Unicode-3.0"), true);
  });
  it("rejects AND when any term is prohibited", () => assert.equal(permits("MIT AND Zlib"), false));
  it("evaluates the base license of an exception", () => {
    assert.equal(permits("Apache-2.0 WITH LLVM-exception"), true);
    assert.equal(permits("GPL-2.0-only WITH Classpath-exception-2.0"), false);
  });
  it("accepts lowercase operators", () => assert.equal(permits("mit or gpl-3.0"), false));
});
