import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { check } from "../src/check.ts";

const source = {
  "trip.title": { message: "Trips" },
  "trip.stopCount": { message: "{count, plural, one {# stop} other {# stops}}" },
};

describe("check", () => {
  it("passes complete translations", () => {
    const result = check(source, {
      "zh-TW": {
        "trip.title": { message: "旅行" },
        "trip.stopCount": { message: "{count, plural, other {# 個景點}}" },
      },
    });
    assert.deepEqual(result, { errors: [], pending: [] });
  });

  it("reports pending translations without failing", () => {
    const result = check(source, {
      "zh-TW": { "trip.title": { message: "旅行" }, "trip.stopCount": { pending: true } },
    });
    assert.deepEqual(result, { errors: [], pending: ["zh-TW: trip.stopCount"] });
  });

  it("fails missing and unknown keys", () => {
    const { errors } = check(source, {
      "zh-TW": { "trip.title": { message: "旅行" }, "trip.extra": { message: "x" } },
    });
    assert.equal(errors.length, 2);
    assert.match(errors.join("\n"), /"trip\.stopCount" is missing/);
    assert.match(errors.join("\n"), /"trip\.extra" does not exist in en/);
  });

  it("fails mismatched arguments", () => {
    const { errors } = check(source, {
      "zh-TW": { "trip.title": { message: "旅行" }, "trip.stopCount": { message: "{count} 個景點" } },
    });
    assert.match(errors[0] ?? "", /arguments \[count:simple\], expected \[count:plural\]/);
  });

  it("fails invalid ICU syntax, empty messages and invalid keys", () => {
    const { errors } = check(
      { "trip.title": { message: "Trips {" }, Bad_Key: { message: "x" } },
      { "zh-TW": { "trip.title": { message: "" }, Bad_Key: { message: "x" } } },
    );
    assert.equal(errors.length, 3);
  });

  it("fails a pending entry that also has a message", () => {
    const { errors } = check(source, {
      "zh-TW": { "trip.title": { message: "旅行", pending: true }, "trip.stopCount": { pending: true } },
    });
    assert.match(errors[0] ?? "", /pending but has a message/);
  });
});
