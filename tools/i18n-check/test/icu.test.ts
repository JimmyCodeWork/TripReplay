import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { argumentSignature, IcuParseError, parseArguments } from "../src/icu.ts";

describe("parseArguments", () => {
  it("returns nothing for plain text", () => {
    assert.deepEqual(parseArguments("No trips yet"), []);
  });

  it("finds simple and typed arguments", () => {
    assert.deepEqual(parseArguments("{name} on {date, date, medium} at {size, number}"), [
      { name: "name", type: "simple" },
      { name: "date", type: "date" },
      { name: "size", type: "number" },
    ]);
  });

  it("finds arguments nested in plural and select options", () => {
    assert.deepEqual(parseArguments("{count, plural, one {# stop in {city}} other {# stops}}"), [
      { name: "count", type: "plural" },
      { name: "city", type: "simple" },
    ]);
    assert.deepEqual(parseArguments("{kind, select, photo {Photo} other {Video}}"), [{ name: "kind", type: "select" }]);
  });

  it("accepts plural offsets and explicit values", () => {
    assert.deepEqual(parseArguments("{n, plural, offset:1 =0 {none} other {# more}}"), [{ name: "n", type: "plural" }]);
  });

  it("ignores braces inside quoted text", () => {
    assert.deepEqual(parseArguments("Use '{name}' literally, it''s fine"), []);
  });

  for (const invalid of [
    "{",
    "}",
    "{count",
    "{1count}",
    "{count, plural, one {# stop}}",
    "{count, plural, other {# stops}",
    "{count, plural, other {a} other {b}}",
    "{count, unknown}",
    "Unterminated '{",
  ]) {
    it(`rejects ${JSON.stringify(invalid)}`, () => {
      assert.throws(() => parseArguments(invalid), IcuParseError);
    });
  }
});

describe("argumentSignature", () => {
  it("rejects one name used with two types", () => {
    assert.throws(() => argumentSignature("{n} and {n, number}"), IcuParseError);
  });
});
